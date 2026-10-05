# Coca-Cola Easy Maintenance

Aplicação de manutenção industrial com Next.js, MySQL e um serviço Python de classificação de falhas. Inclui importação de planilhas, revisão humana, indicadores, relatórios e análises MASP.

## Configuração local

1. Instale as dependências JavaScript com `npm ci`.
2. Copie `.env.example` para `.env.local` e configure a conexão MySQL. Gere `AUTH_SECRET` (mínimo de 32 caracteres) com `openssl rand -hex 32`.
3. Para uma instalação nova, execute `database/schema.sql` no MySQL 8. O arquivo cria o banco `coca_cola_maintenance` e não cadastra nenhum usuário. Em bancos existentes, aplique as migrações pendentes em `database/migrations/`: o login exige a tabela `login_attempts` (`20261002_login_attempts.sql`) e `20261004_analytics_indexes.sql` cria os índices usados pelos gráficos.
4. Configure um ambiente Python e instale `ml/requirements.txt`. Os modelos em `ml/models/` precisam estar disponíveis como arquivos reais, não apenas ponteiros do Git LFS.
5. Execute `npm run dev` para iniciar Next.js e ML, ou `npm run dev:next` para iniciar apenas a aplicação web.

`GROQ_API_KEY` é opcional para a integração externa de IA. A classificação ML usa `ML_SERVICE_URL`, cujo padrão é `http://127.0.0.1:8001`.

Crie o primeiro Analista com:

```bash
node --env-file=.env.local scripts/create-user.mjs "Nome" "email@empresa.com" "SENHA" "ANALISTA" "BAAK"
```

## Acesso

- Cada usuário vê e altera apenas os dados das unidades em que está cadastrado (`user_units`).
- **Analista**: importa planilhas, revisa classificações, edita MASP e administra os usuários das próprias unidades. Toda unidade mantém ao menos um Analista ativo.
- **Gestor**: somente consulta.

`LOGIN_TRUSTED_IP_HEADER` (opcional) ativa o limite de tentativas de login por IP. Use apenas o nome de um header que o proxy reverso sempre sobrescreve, como `x-real-ip`.

## Verificação

```bash
npm test
npm run lint
npx tsc --noEmit
python -m unittest discover -s ml/tests -v
npm run build
```

O build exige as variáveis de banco e autenticação configuradas e acesso ao download da fonte Inter. Para executar em produção, use `npm start` após o build e mantenha MySQL e o serviço ML acessíveis.

A revisão de código e os limites das verificações desta rodada estão em [AUDIT.md](AUDIT.md).
