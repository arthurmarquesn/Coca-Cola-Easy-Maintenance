# Coca-Cola Easy Maintenance

Aplicação de manutenção industrial com Next.js, MySQL e um serviço Python de classificação de falhas. Inclui importação de planilhas, revisão humana, indicadores, relatórios e análises MASP.

## Configuração local

1. Instale as dependências JavaScript com `npm ci`.
2. Copie `.env.example` para `.env.local` e configure a conexão MySQL. Gere `AUTH_SECRET` (mínimo de 32 caracteres) com `openssl rand -hex 32`.
3. Execute `database/schema.sql` no MySQL 8. O arquivo consolida todas as migrações anteriores, cria o banco `coca_cola_maintenance` e não cadastra nenhum usuário. Ele é idempotente (`CREATE ... IF NOT EXISTS`): em um banco existente cria as tabelas que faltam, mas não altera colunas nem índices de tabelas já criadas. Para atualizar um banco antigo, use as migrações removidas do diretório, disponíveis no histórico do git (commit `c5ff0b4`, pasta `database/migrations/`). Para desenvolvimento local, `database/migrations/20261005_seed_test_users.sql` cria um Analista e um Gestor de teste com senhas conhecidas: não execute esse arquivo em produção.
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
python -m pytest ml/tests   # requer pytest: pip install pytest
npm run build
```

O build exige as variáveis de banco e autenticação configuradas e acesso ao download da fonte Inter. Para executar em produção, use `npm start` após o build e mantenha MySQL e o serviço ML acessíveis.

A revisão de código e os limites das verificações desta rodada estão em [AUDIT.md](AUDIT.md).
