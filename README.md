# Coca-Cola Easy Maintenance

Aplicação de manutenção industrial com Next.js, MySQL e um serviço Python de classificação de falhas. Inclui importação de planilhas, revisão humana, indicadores, relatórios e análises MASP.

## Configuração local

1. Instale as dependências JavaScript com `npm ci`.
2. Copie `.env.example` para `.env.local` e configure a conexão MySQL. Gere `AUTH_SECRET` (mínimo de 32 caracteres) com `openssl rand -hex 32`.
3. Execute `database/schema.sql` no MySQL 8 (8.0.19 ou superior). Reexecutar em um banco existente cadastra ou atualiza as 12 unidades pelo código do centro, sem apagar dados. O arquivo consolida todas as migrações anteriores, cria o banco `coca_cola_maintenance` e não cadastra nenhum usuário. Ele é idempotente (`CREATE ... IF NOT EXISTS`): em um banco existente cria as tabelas que faltam, mas não altera colunas nem índices de tabelas já criadas. Para atualizar um banco antigo, use as migrações removidas do diretório, disponíveis no histórico do git (commit `c5ff0b4`, pasta `database/migrations/`). Para desenvolvimento local, `database/migrations/20261005_seed_test_users.sql` cria um Analista e um Gestor de teste com senhas conhecidas: não execute esse arquivo em produção.
4. Configure um ambiente Python e instale `ml/requirements.txt`. Os modelos em `ml/models/` precisam estar disponíveis como arquivos reais, não apenas ponteiros do Git LFS.
5. Execute `npm run dev` para iniciar Next.js e ML, ou `npm run dev:next` para iniciar apenas a aplicação web.

`GROQ_API_KEY` é opcional para a integração externa de IA. A classificação ML usa `ML_SERVICE_URL`, cujo padrão é `http://127.0.0.1:8001`.

Crie o primeiro Analista com:

```bash
node --env-file=.env.local scripts/create-user.mjs "Nome" "nome@kof.com" "SENHA" "ANALISTA" "BAAK"
```

## Acesso

- As unidades da Coca-Cola FEMSA (código do centro, nome e código SAP) ficam na tabela `units`, carregada por `database/schema.sql`. É a única fonte da lista: telas e APIs leem dessa tabela.
- Cada usuário tem uma unidade principal (`users.unit_id`) e vê e altera apenas os dados das unidades em que está cadastrado (`user_units`). O backend valida a seleção de unidades em toda requisição; o filtro da topbar é só a interface.
- **Analista**: importa planilhas, revisa classificações, edita MASP e administra os usuários das próprias unidades. Pode receber unidades de acesso adicionais (entre as unidades de quem o cadastra) e escolher uma ou várias na topbar. Toda unidade mantém ao menos um Analista ativo.
- **Gestor**: somente consulta, e somente a unidade principal. O backend ignora qualquer outra unidade enviada (cookie, query string ou corpo), mesmo que exista outro vínculo em `user_units`.

Login e cadastro aceitam somente e-mails corporativos `@kof.com` (API e `scripts/create-user.mjs`). `ALLOWED_EMAIL_DOMAINS` troca a lista; em desenvolvimento use `kof.com,example.com` para as contas de teste. Não inclua `example.com` em produção.

`LOGIN_TRUSTED_IP_HEADER` (opcional) ativa o limite de tentativas de login por IP. Use apenas o nome de um header que o proxy reverso sempre sobrescreve, como `x-real-ip`.

## Verificação

```bash
npm test
npm run lint
npx tsc --noEmit
python -m pytest ml/tests   # requer pytest: pip install pytest
npm run build
```

O build exige as variáveis de banco e autenticação configuradas e acesso ao download da fonte Inter. O build gera `.next/standalone` (`output: "standalone"`): fora dos contêineres, rode `node .next/standalone/server.js` após copiar `public` e `.next/static` para dentro dele, conforme a documentação do Next.js. Em produção, use os contêineres descritos abaixo.

## Produção

O deploy do piloto (Oracle Cloud Always Free, São Paulo) usa Docker Compose com Caddy (HTTPS), o site em modo `standalone` e o serviço ML numa rede interna protegida por `ML_SERVICE_TOKEN`. O banco é o MySQL HeatWave, acessado com TLS (`DB_SSL`, `DB_SSL_CA`, `DB_SSL_VERIFY_HOSTNAME`). O passo a passo completo, com banco, backup criptografado, segurança e verificação, está em [deploy/DEPLOY.md](deploy/DEPLOY.md).

A revisão de código e os limites das verificações desta rodada estão em [AUDIT.md](AUDIT.md).
