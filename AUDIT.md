# Revisão de 04/10/2026

Auditoria completa após os merges `origin/marques` → `china` e a remoção do papel ADMIN. As ferramentas estáticas já passavam; os problemas eram de lógica, dados, segurança e higiene do repositório. Não foram alterados dados de produção nem executadas migrações.

## Ações necessárias no banco

- **Troque a senha de `teste@email.com`** em todo banco criado com o `schema.sql` anterior: o arquivo trazia esse Analista com a senha `teste123` documentada e a redefinia a cada execução. O seed foi removido.
- Aplique `database/migrations/20261002_login_attempts.sql` (se ainda não aplicada) e `20261004_analytics_indexes.sql`.

## Correções

**Repositório**
- Arquivos usados pelo código, mas fora do git (`write-access.ts`, `login-throttle.ts`, `apply-review.ts`, `use-initial-request.ts`, `imports/limits.ts`, `imports/lock.ts`, migração de `login_attempts`, testes) foram adicionados ao índice. Um clone limpo não compilava.
- Removidos `diff-ml.txt`, `database/coca_banco.sql` (ENUM `GESTOR/ANALISTA` e colunas incompatíveis com o código), `.pyc` e código morto (`src/app/home/_components`, cópias de rotas em `src/lib/ml/{health,predict}`, `lib/users.ts`, `lib/ai/classify-import.ts`, `lib/analytics/cache.ts`, `components/review/review-page.tsx`).
- Removidas `/api/review/accept-all` (sem uso na UI, sem limite, aprovação irreversível) e `/api/ai/test` (chamada paga ao Groq aberta a qualquer usuário).
- `scripts/create-admin.mjs` unificado em `create-user.mjs`, com validação de 8–72 bytes de senha.

**Acesso**
- Cada usuário só vê e altera dados das unidades em `user_units` (`getAuthorizedUnits`). Antes, qualquer usuário acessava todas as unidades ativas. Edição de classificação e filtros de revisão passaram a seguir a seleção de unidades.
- Analista só administra usuários que compartilham unidade com ele; o último Analista ativo de uma unidade não pode ser rebaixado, desativado ou excluído (transação com `FOR UPDATE`). Senha validada em bytes, igual ao login.
- UI do Gestor sem ações que a API recusa: revisão, MASP (somente leitura), edição no histórico e "Iniciar MASP".
- Rotas de criticidade usam `session.role` em vez de reler o papel bruto do banco (ADMIN legado era tratado de forma diferente em cada rota).
- Login: hash fictício com o mesmo custo dos reais (evita enumerar contas pelo tempo); limite por IP opcional via `LOGIN_TRUSTED_IP_HEADER`; limpeza de tentativas expiradas não derruba mais um login válido. `AUTH_SECRET` exige 32+ caracteres.
- Mensagens do MySQL e exceções internas não chegam mais ao navegador (`publicErrorMessage`); relatório decide 403 por classe de erro, não pelo texto.

**Dados e analytics**
- Datas um dia antes: o pool lia `DATE` como meia-noite UTC e formatava no horário local (BRT). Agora `DATE` vem como texto (`dateStrings`).
- Origem da falha contada em dobro após trocar o modelo de origem: junção pela previsão mais recente, com a revisão manual tendo prioridade também no resumo.
- MASP e PDF ignoravam a correção do revisor (gravada só em `classification_notes`); agora usam a mesma regra dos gráficos. Confiabilidade e MASP usam a mesma definição de sugestão vigente.
- Importação: cabeçalhos com variação de caixa/acento/espaço eram aceitos mas lidos como vazios; linhas idênticas a eventos já importados na unidade são puladas (exportação acumulada não duplica mais); `31/02` e valores negativos não abortam a importação; falha fica registrada como `FAILED`.
- ML: um evento longo ou só com espaços derrubava o lote de 250; `classify-pending` reprocessava os mesmos eventos para sempre; eventos já classificados oficialmente recebiam sugestões que não podiam ser revisadas (fila nunca zerava). Regras: "esteira quebrou o rolamento", "corrente da esteira quebrada" e "rolete da esteira patinando" eram rotuladas errado com confiança alta (`rules-v3.1`; eventos sem revisão serão reclassificados).
- MASP: datas impossíveis viravam erro 500; escopo com início depois do fim; etapas sem o registro mínimo da anterior; encerramento com recorrência detectada na última verificação. Da verificação é possível voltar ao plano de ação ou à execução (pela API; a UI ainda só avança).
- Exportação do histórico limitada a 100 mil linhas. Busca trata `%` e `_` como texto.

**Interface**
- Dark mode: linhas e rótulos dos gráficos de confiabilidade, Ishikawa e fundos de seleção usam tokens do tema; `color-scheme` para controles nativos.
- Histórico descarta respostas de buscas antigas; gráficos complementares mostram carregamento e não exibem "SyntaxError" em erro do servidor; grade do painel sem card órfão.

## Validação

- `npm test`: 58 testes (novos: escopo de unidades, administração de usuários, throttle de login, cabeçalhos da importação, mensagens de erro).
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: aprovados.
- `python -m unittest discover -s ml/tests`: aprovado, com os casos novos das regras.
- `next build`: aprovado com variáveis temporárias, sem banco real.

## Pendências

- Nada foi executado contra um MySQL real. Antes de publicar, teste com dois usuários de unidades diferentes: dashboards, histórico, exportação, revisão, MASP e relatório devem mostrar só a unidade de cada um.
- A classificação ML após a importação ainda roda dentro da mesma requisição; planilhas muito grandes podem passar do tempo limite (os dados já ficam gravados).
- Páginas `/dashboard/ativos` e `/dashboard/modelo-ml` não têm link no menu.
- `src/lib/ai/client.ts` (Groq) ficou sem uso.
- O painel inicial ainda tem cabeçalho próprio em vez de `AppHeader`.

---

# Revisão de 03/10/2026

A revisão foi realizada sobre a árvore de trabalho existente, preservando as alterações anteriores. Não foram alterados dados de produção nem executadas migrações.

## Correções desta rodada

- Carregamento inicial de criticidade, histórico, usuários, unidades e revisão: uso do hook existente de inicialização com cancelamento, repasse de `AbortSignal` ao fetch e descarte de respostas canceladas. Resolve os cinco erros de hooks detectados pelo ESLint.
- Revisão por categoria: cancela a consulta anterior ao iniciar outra e ao mudar filtros/desmontar a tela, evitando que respostas atrasadas sobrescrevam a seleção atual.
- Resumo de revisão: aplica a categoria selecionada e mantém o progresso independente do filtro de status da tabela. Antes, os totais incluíam outras categorias e o filtro de pendentes ocultava as revisões concluídas.
- Componente antigo de revisão: alinhamento de `REJECT`, `correctedComponent` e `rejected` com a API, consulta somente de pendências, opções locais da taxonomia e atualização do listener de teclado para evitar closures desatualizadas. Este componente não é a página de revisão atualmente roteada.
- Validação de JSON em login, revisão individual/em lote, criação/edição de usuários, classificação no histórico, criticidade e seleção de unidades: corpos nulos, arrays ou valores primitivos recebem erro 400.
- Filtros de revisão: valores vazios de confiança não viram zero; datas impossíveis não são enviadas ao MySQL.
- Groq: inicialização sob demanda. A ausência de uma chave opcional não impede mais a importação dos módulos durante o build. Ao tentar usar a integração sem a chave, o erro de configuração continua explícito.
- Limpeza dos avisos de lint: código morto de importação, navegação no logout, parâmetro legado e identificação correta da imagem do renderizador PDF.
- Inclusão de `.env.example` e instruções de configuração no README.

## Validação

- `npm test`: 34 testes aprovados, incluindo 26 novos casos para validação de entrada, resumo da revisão, controle de acesso, filtros e inicialização opcional do Groq.
- `npm run lint`: sem erros ou avisos.
- `npx tsc --noEmit`: aprovado.
- `python -m unittest discover -s ml/tests -v`: 2 testes aprovados.
- Build Next.js: aprovado com configuração temporária de banco/autenticação, sem credenciais reais e sem chave Groq. Foi necessário executar fora do sandbox para concluir a compilação com download das fontes.
- `git diff --check`: aprovado.

## Limites

Os testes de API usam mocks do banco e da sessão. Não validam consultas contra um MySQL real. Não foram executados testes de navegador, importações completas, geração real de relatórios ou inferência dos modelos em um serviço ML ativo. O build aprovado não substitui essa validação de integração.

O Next.js ainda informa que ignora um `package-lock.json` externo ao repositório; isso não impediu o build. O Vitest também informa a depreciação da API CJS do Vite; isso não impediu os testes. Dependências e artefatos de modelos não passaram por auditoria de vulnerabilidades nesta rodada.
