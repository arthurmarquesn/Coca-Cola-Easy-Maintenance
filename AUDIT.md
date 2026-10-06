# Revisão de 05/10/2026

Revisão do código entrado após a auditoria de 04/10 (merges `origin/marques` → `china`: páginas de confiabilidade, importações, Ursus e modelo v1.6). Não foram alterados dados de produção nem executadas migrações.

## Correções

- **`DELETE /api/imports/[id]` sem controle de escrita**: qualquer usuário autenticado, inclusive Gestor, podia excluir uma importação e todos os eventos dela. Agora exige Analista (`getWriteAccessError`). Teste novo em `route.test.ts`.
- **Modelo Ursus v1.6 nunca carregava fora da máquina de origem**: `ml/reports/ursus_reranker_v16_locked_config.json` foi travado com CRLF, o git o normalizou para LF e o SHA-256 conferido em `ml/model_registry.py` deixou de bater. O serviço caía para a v1.5. Bytes originais restaurados (hash `fd20bc5e…` de novo) e arquivo marcado `-text` no `.gitattributes`.
- Erros internos (MySQL) chegavam ao navegador em `GET /api/imports` e `DELETE /api/imports/[id]`: agora usam `publicErrorMessage`. Busca de importações trata `%` e `_` como texto.
- Rotas novas de confiabilidade (`equipment-dna`, `failures`, `lines`, `origins`, `timeline`) aceitavam datas impossíveis como `2026-02-31`: passam a usar a validação de calendário de `lib/analytics/sql`.
- Lint: 6 erros de `setState` dentro de `useEffect` (agrupamento da linha do tempo e do DNA do equipamento, paginação do Jack-Knife, carga do Ursus) e um import sem uso. O Ursus usa `useInitialRequest` com cancelamento.
- Removido `src/components/dashboard/product-entry-transition.tsx` (sem uso; o painel tem `ProductEntryIntro` próprio).
- 41 arquivos `.pyc`/`__pycache__` saíram do índice do git (já estavam no `.gitignore`).
- `20261005_seed_test_users.sql` criava as contas sem vínculo em `user_units` (sem acesso a nenhuma unidade): o cliente `mysql` envia a linha de comentário entre o `INSERT` e o `SET` como comando vazio, zerando `ROW_COUNT()`. O vínculo agora depende de a conta não existir antes da execução. Testado duas vezes seguidas em MySQL 8.4.
- Teste `test_v16_runtime.py` esperava `rules-v3`; usa `RULES_VERSION`.
- README: as migrações citadas foram removidas e consolidadas no `schema.sql`; instruções atualizadas, aviso sobre o seed de usuários de teste e comando `pytest` (os testes ML são pytest, não unittest).

### Teste de ponta a ponta do ML (MySQL 8.4 local, serviço ML v1.5 e v1.6, planilha com observações reais de Marília)

- **Fila de revisão quase toda em "Outros problemas"** (301 de 304): os modelos Ursus gravam em `failed_component_code` o código do modo de falha (`FALHA_DE_SENSOR`), e as categorias comparavam por igualdade com códigos de componente (`SENSOR`). Agora o componente é procurado como token no código, com alguns sinônimos da taxonomia. Nos rótulos reais de Marília, "Outros" cai de 99% para 62%; o restante são modos sem componente (garrafas, tampas, paletes).
- **Sugestões substituídas contavam como revisadas**: ao reclassificar após trocar o modelo, as sugestões antigas viram `DESCARTADA` sem revisor e apareciam como "validadas" e "rejeitadas" (304 validadas sem nenhuma revisão). Excluídas da fila e dos totais em `review-filters.ts`.
- **`/api/ml/classify-pending` não gravava a origem da falha** nem os metadados da decisão; os eventos ficavam sem Operação x Manutenção para sempre. A rota passou a classificar em lote e gravar como `lib/ml/classify-import`. Eventos já afetados se corrigem com "Classificar novamente" na importação.
- **Regras ignoravam negação**: "não houve falha de corte de filme" virava `FALHA DE CORTE DE FILME` com 0,99. Frases que negam a ocorrência agora vão para o ML (`rules-v3.2`); os 181 acertos de regra na planilha real não mudam. Eventos sem revisão serão reclassificados pela nova versão.
- **Logs de auditoria do runtime eram descartados**: o logger `ursus.runtime` não tinha handler sob o uvicorn, então falha ao carregar a v1.6 e fallback para a v1.5 durante a inferência não apareciam em lugar nenhum. Configurado no startup da API; o texto da observação continua fora do log (só hash).

Funcionaram como esperado: importação com o ML desligado (`MODEL_OFFLINE`, dados gravados), reclassificação idempotente, troca v1.6 → v1.5 preservando revisões humanas, linhas só com espaço/tab/NBSP ignoradas, textos de 6–7 mil caracteres, datas impossíveis e períodos invertidos recusados, Gestor bloqueado em todas as rotas de escrita.

## Validação

- `npm test` (64), `npm run lint`, `npx tsc --noEmit`, `git diff --check` e `next build` (variáveis temporárias, sem banco): aprovados.
- `pytest ml/tests` em venv limpo com `ml/requirements.txt`: 70 aprovados, 3 reprovados (abaixo).

## Pendências

- **"Confiança" das sugestões do ML é praticamente constante (~1,3%)**: o wrapper normaliza os scores de cada linha para [-1, 1] (top-1 sempre 1,0) e a API aplica softmax sobre 421 classes. Toda sugestão aparece como baixa confiança, o filtro e a ordenação por confiança não servem, e as regras (0,99) ficam numa escala diferente. Precisa de decisão de quem mantém o ML: esconder o número para `ranking_score_not_probability` ou calibrar um score real.
- A revisão mostra só a sugestão Top-1 (≈75% de acerto); a API já envia o Top-3 (≈90%), mas a tela não oferece escolher a 2ª ou 3ª opção. A correção é texto livre e cria modos de falha fora da taxonomia ("Falha de Válvula de rejeito").
- Regras: negação com "SEM" antes da palavra-chave ("sem mangueira rompida") ainda dispara a regra.
- 3 testes ML (`test_taxonomy_v3_candidate::test_audit_passes`, `test_ursus_reranker_failures::test_outputs_are_deterministic`, `test_ursus_suggestion_quality::test_outputs_are_deterministic_without_mutating_inputs`) só passam na máquina onde os relatórios foram gerados: `ml/taxonomy/version.json` e os relatórios congelados gravam caminhos absolutos (`C:\Users\arthu\...`) e hashes de CSVs com CRLF. Corrigir exige regenerar esses artefatos com caminhos relativos e hash independente de fim de linha; decisão de quem mantém o ML.
- `database/migrations/20261005_seed_test_users.sql` cria contas com senhas publicadas no próprio arquivo. Usar só em desenvolvimento.
- Bancos existentes não têm mais caminho de atualização no diretório: `schema.sql` não altera tabelas já criadas.
- Pendências da rodada anterior continuam (teste com MySQL real e dois usuários de unidades diferentes etc.).

---

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
