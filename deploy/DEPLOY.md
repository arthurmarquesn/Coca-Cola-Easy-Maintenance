# Deploy na Oracle Cloud (Always Free, São Paulo)

Guia do piloto de 1 unidade. Arquitetura:

```
Internet ──HTTPS 443──> Caddy ──> web (Next.js :3000) ──> ml (FastAPI :8001, rede interna, token)
                                        │
                                        └──TLS──> MySQL HeatWave (sub-rede privada)
```

Só 80/443 (e SSH com chave) ficam abertas. O ML não tem rota para a
internet e o banco não tem IP público.

Arquivos deste diretório:

| Arquivo | Uso |
| --- | --- |
| `../Dockerfile` | Imagem do site (Next.js standalone, usuário não-root) |
| `../ml/Dockerfile` | Imagem do ML (só os artefatos de runtime; falha se o modelo for ponteiro LFS) |
| `../docker-compose.prod.yml` | Caddy + web + ml, healthchecks, logs rotacionados |
| `Caddyfile` | HTTPS automático, limite de 60 MB, `X-Real-IP` |
| `env.production.example` | Modelo do `.env.production` |
| `backup.sh` | Dump semanal criptografado para o Object Storage |
| `secrets/` | CA do banco (fora do git) |

---

## Fase 2: conta e infraestrutura (painel da Oracle)

1. **Conta**: crie em <https://cloud.oracle.com> com região inicial
   **Brazil East (São Paulo) `sa-saopaulo-1`**. A região inicial não
   muda depois e é onde ficam os recursos Always Free. O cartão é só
   para verificação.
2. **Pay As You Go + orçamento**: em *Billing → Upgrade*, converta para
   Pay As You Go. Os recursos Always Free continuam sem custo, e a
   Oracle deixa de recuperar VMs gratuitas ociosas. Em *Billing →
   Budgets*, crie um orçamento de **US$ 1** com alerta por e-mail.
3. **Rede (VCN)**: *Networking → Virtual Cloud Networks → Start VCN
   Wizard → Create VCN with Internet Connectivity*. O assistente cria
   uma sub-rede pública (VM) e uma privada (banco).
4. **VM**: *Compute → Instances → Create*.
   - Imagem: **Canonical Ubuntu 22.04**.
   - Shape: **VM.Standard.A1.Flex**, 4 OCPU, 24 GB de memória.
   - Sub-rede pública, com IP público.
   - Chave SSH: envie a sua chave pública.
   - Disco de boot: 100 GB ou mais (até 200 GB no Always Free).
   - Se aparecer *Out of capacity*, troque o *availability domain* ou
     tente em outro horário.
5. **Portas 80/443**:
   - *Security List* da sub-rede pública: regras de entrada TCP 80 e
     TCP 443 de `0.0.0.0/0`. Opcional: UDP 443 (HTTP/3).
   - Na VM, a imagem Ubuntu da Oracle bloqueia por padrão:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
6. **Banco**: *Databases → MySQL HeatWave → Create DB system*, opção
   **Always Free**.
   - Sub-rede **privada** da VCN.
   - Anote o usuário administrador e a senha (gere com
     `openssl rand -hex 24`).
   - Backup automático ligado (padrão).
   - Na *Security List* da sub-rede privada: entrada TCP 3306 **apenas**
     do CIDR da sub-rede pública (ex.: `10.0.0.0/24`).
   - Anote o IP privado do banco.

## Fase 3: banco

Todos os comandos rodam **na VM**. O cliente `mysql` roda em
contêiner, então a VM não precisa dele instalado (instale o Docker
primeiro, Fase 4 passo 1).

1. **CA do banco**: o HeatWave usa certificado autogerado e envia a
   CA junto na conexão. Pegue o último certificado da cadeia pela rede
   privada:
   ```bash
   cd /opt/easy-maintenance
   mkdir -p deploy/secrets && chmod 700 deploy/secrets
   openssl s_client -starttls mysql -connect IP_DO_BANCO:3306 -showcerts </dev/null 2>/dev/null \
     | awk '/BEGIN CERTIFICATE/{buf=""} {buf=buf $0 "\n"} /END CERTIFICATE/{last=buf} END{printf "%s", last}' \
     > deploy/secrets/db-ca.pem
   openssl x509 -in deploy/secrets/db-ca.pem -noout -subject -issuer -enddate
   chmod 644 deploy/secrets/db-ca.pem
   ```
   O `subject` e o `issuer` devem ser iguais (certificado de CA
   autoassinado). Se não forem, o servidor não enviou a CA: baixe-a
   pelo painel do HeatWave ou fale com o suporte antes de seguir.

   O nome no certificado não bate com o IP do banco. Por isso a
   aplicação usa `DB_SSL_VERIFY_HOSTNAME=false`: a CA continua sendo
   validada (equivale a `--ssl-mode=VERIFY_CA`). Uma CA errada é
   recusada com `self-signed certificate in certificate chain`.

2. **Schema** (com o usuário administrador):
   ```bash
   docker run --rm -i --network host -v "$PWD/deploy/secrets/db-ca.pem:/ca.pem:ro" mysql:8.4 \
     mysql -h IP_DO_BANCO -u ADMIN -p --ssl-mode=VERIFY_CA --ssl-ca=/ca.pem \
     < database/schema.sql
   ```
   **Nunca** rode `database/migrations/20261005_seed_test_users.sql` em
   produção: ele cria contas com senhas conhecidas.

3. **Usuários de privilégio mínimo** (gere as senhas com
   `openssl rand -hex 24`; senhas só com hex evitam problemas de
   escape):
   ```sql
   -- Aplicação: só leitura e escrita de dados. Sem DDL, sem GRANT.
   CREATE USER 'easy_app'@'%' IDENTIFIED BY 'SENHA_APP' REQUIRE SSL;
   GRANT SELECT, INSERT, UPDATE, DELETE ON coca_cola_maintenance.* TO 'easy_app'@'%';

   -- Backup: só leitura.
   CREATE USER 'easy_backup'@'%' IDENTIFIED BY 'SENHA_BACKUP' REQUIRE SSL;
   GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON coca_cola_maintenance.* TO 'easy_backup'@'%';
   ```
   Para executar, use o mesmo `docker run ... mysql ...` do passo 2 sem
   o `< database/schema.sql` e cole os comandos.

4. **Backup semanal** para o Object Storage:
   - *Storage → Buckets → Create Bucket* (`easy-maintenance-backups`,
     tier Standard, privado).
   - No bucket: *Pre-Authenticated Requests → Create*, tipo **Bucket**,
     acesso **Permit object writes**, com validade longa (ex.: 1 ano;
     anote a data para renovar). Copie a URL.
   - Crie `/etc/easy-maintenance/backup.env` (modelo no topo de
     `backup.sh`) com `chmod 600`. Gere `BACKUP_PASSPHRASE` com
     `openssl rand -hex 32` e **guarde-a fora da VM** (sem ela o backup
     não abre).
   - Teste: `sudo /opt/easy-maintenance/deploy/backup.sh`.
   - Agende (domingo, 03:00):
     ```bash
     echo '0 3 * * 0 root /opt/easy-maintenance/deploy/backup.sh >> /var/log/easy-backup.log 2>&1' \
       | sudo tee /etc/cron.d/easy-backup
     ```
   - Confirme no painel que o backup automático diário do HeatWave está
     ativo.

## Fase 4: deploy

1. **Pacotes da VM**:
   ```bash
   sudo apt update && sudo apt -y upgrade
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"   # saia e entre de novo no SSH
   sudo apt -y install git git-lfs fail2ban unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```
2. **Código**: o repositório é privado. Crie uma *deploy key* só de
   leitura (o dono do repositório adiciona em *Settings → Deploy keys*):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/easy_deploy -N ""
   cat ~/.ssh/easy_deploy.pub   # cole como deploy key, sem escrita
   sudo mkdir -p /opt/easy-maintenance && sudo chown "$USER" /opt/easy-maintenance
   GIT_SSH_COMMAND="ssh -i ~/.ssh/easy_deploy" GIT_LFS_SKIP_SMUDGE=1 \
     git clone -b china git@github.com:arthurmarquesn/Coca-Cola-Easy-Maintenance.git /opt/easy-maintenance
   cd /opt/easy-maintenance
   git config core.sshCommand "ssh -i ~/.ssh/easy_deploy"
   git lfs pull --include="ml/models/failure_classifier_marilia_v1_5_candidate.joblib,ml/models/ursus_reranker_v16_experimental_locked.joblib,ml/models/failure_origin_classifier_v4_candidate.joblib"
   ```
   O `GIT_LFS_SKIP_SMUDGE=1` baixa só os 3 modelos de runtime (cerca de
   440 MB) em vez de todos. A cota de banda do Git LFS no GitHub é
   limitada: evite clones repetidos.
3. **Ambiente**:
   ```bash
   cp deploy/env.production.example .env.production
   chmod 600 .env.production
   openssl rand -hex 32   # AUTH_SECRET
   openssl rand -hex 32   # ML_SERVICE_TOKEN
   nano .env.production
   ```
   Use segredos **novos**: nada do ambiente de desenvolvimento.
   Deixe `GROQ_API_KEY` vazio, porque a integração enviaria observações
   de manutenção a terceiros.
4. **Endereço**: em <https://www.duckdns.org>, crie o subdomínio
   (ex.: `easymaintenance`) apontando para o IP público da VM e coloque
   `DOMAIN=easymaintenance.duckdns.org` no `.env.production`. O DNS
   precisa apontar para a VM **antes** de subir o Caddy, senão o
   certificado não é emitido. Se o IP da VM mudar, atualize no DuckDNS.
5. **Subir**:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.prod.yml ps
   ```
   O ML leva alguns segundos para carregar os modelos. O web só sobe
   com o ML saudável, e o Caddy só sobe com o web saudável.
6. **Primeiro Analista**. O espaço no início evita que a senha fique no
   histórico do shell:
   ```bash
    docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
      node scripts/create-user.mjs "Nome" "email@empresa.com" "SENHA_FORTE" "ANALISTA" "BAAK"
   ```
7. **Atualizações**:
   ```bash
   cd /opt/easy-maintenance && git pull && git lfs pull --include="..."   # mesmos 3 modelos
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   docker image prune -f
   ```

## Fase 5: segurança e LGPD

Já garantido pelo código e pela infraestrutura:

- HTTPS obrigatório: o Caddy redireciona `http://` e o site envia HSTS.
  Também saem CSP, `X-Frame-Options: DENY`, `nosniff` e
  `Referrer-Policy`, e o `X-Powered-By` foi removido.
- O cookie de sessão é `HttpOnly`, `Secure` e `SameSite=Lax` em
  produção.
- O banco não tem IP público e só aceita TLS (`REQUIRE SSL`). O ML fica
  numa rede sem saída para a internet e exige `X-ML-Token`.
- O acesso é por unidade e por papel (Analista/Gestor, `user_units`).
  O login limita tentativas por IP (`LOGIN_TRUSTED_IP_HEADER=x-real-ip`,
  header que o Caddy sobrescreve).
- Os dados ficam em São Paulo, criptografados em repouso (padrão da
  Oracle) e em trânsito. O backup extra também é criptografado.
- Os contêineres rodam como usuário não-root.

Fica com você:

- SSH só com chave (padrão da imagem). Confira que
  `PasswordAuthentication no` está em `/etc/ssh/sshd_config`.
- Troque todas as senhas que existiram em desenvolvimento.
- Definir com a empresa quem pode ter conta, o prazo de retenção dos
  dados e o ponto de contato para LGPD.

## Fase 6: operação

- **Monitoramento grátis**: no UptimeRobot, crie checks HTTP(s) a cada
  5 min em `https://DOMINIO/login` e `https://DOMINIO/api/health/database`
  (este responde 503 se o banco cair), com alerta por e-mail.
- **Logs**:
  ```bash
  docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200 web ml
  docker compose ... logs ml | grep -E "model_load_failure|inference_failure|fallback"
  ```
  Os logs giram em 5 arquivos de 10 MB por serviço.
- **Capacidade**: o ML ocupa cerca de 600 MB de RAM em repouso. O pool
  do MySQL usa 10 conexões (`src/lib/db.ts`).

## Verificação (fim do deploy)

1. `https://DOMINIO` abre com cadeado válido, e `http://` redireciona.
2. Login de Analista e de Gestor. O Gestor não vê Importar/Usuários e
   recebe 403 nas rotas de escrita.
3. Na tela Ursus e em `/api/ml/health`: `ursus-v1.6` e
   `fallbackUsed: false`.
4. Importar uma planilha real grande, com dezenas de milhares de
   linhas. Ela termina sem erro, com os eventos classificados com
   componente e origem e as categorias distribuídas na revisão.
5. Revisar algumas sugestões. Conferir dashboards, histórico,
   exportação e PDF.
6. De fora da VM, as portas 3306, 3000 e 8001 devem estar fechadas:
   `nmap -Pn -p 22,80,443,3000,3306,8001 DOMINIO`.
7. `sudo reboot`: tudo volta sozinho em poucos minutos.
8. Restaurar um backup num banco de teste e conferir os dados:
   ```bash
   gpg -d ARQUIVO.sql.gz.gpg | gunzip > restore.sql
   docker run -d --name restore-test -e MYSQL_ROOT_PASSWORD=teste -e MYSQL_DATABASE=coca_cola_maintenance mysql:8.4
   docker exec -i restore-test mysql -uroot -pteste coca_cola_maintenance < restore.sql
   docker exec restore-test mysql -uroot -pteste -e "SELECT COUNT(*) FROM coca_cola_maintenance.maintenance_events"
   docker rm -f restore-test && shred -u restore.sql
   ```

## Limitações do plano gratuito

- É uma única VM, sem alta disponibilidade e sem SLA. Um reinício
  deixa o sistema alguns minutos fora do ar.
- A classificação ML roda dentro da requisição de importação. Com 1
  unidade é aceitável; ao crescer, mover para uma fila de jobs.
- Para várias unidades, migrar para a conta corporativa da empresa. Os
  mesmos contêineres rodam em AWS ECS/RDS ou Azure Container
  Apps/MySQL Flexible Server.
