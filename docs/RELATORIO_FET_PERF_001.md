# Relatório FET-PERF-001 — F022

## Resultado

**CONCLUÍDO — F022 CORRIGIDO NO CÓDIGO.** Deployment dos índices permanece operação separada e não executada no banco comercial.

## Branch, HEAD e worktree

- Branch: main.
- HEAD inicial/final: 68cb9b3bb5d514ee56fbffac0bad515496a3cbce.
- Inicial: limpo. F037 já commitada em 68cb9b3; attachment estava desatualizado.
- Alterações anteriores preservadas. F022 permanece sem commit; nenhum reset/clean.
- Finding tratado: **F022**. F037 continua corrigido no código.

## Inventário de endpoints

Tabela completa com método, rota, tipo, auth/fonte, paginação, default/max, sort,
index/payload: [PAGINACAO_E_PERFORMANCE_API.md](PAGINACAO_E_PERFORMANCE_API.md#inventário-completo).
Products, orders, users, audit e reviews são PAGINATED_COLLECTION. Categories
públicas/admin e addresses são BOUNDED_REFERENCE_SET. Details são SINGLE_RESOURCE.

## Findings reproduzidos

Probe inicial executado antes das edições em replica set temporário, com 55
products/55 orders/56 users: admin products retornava 55 e ~1,1 MB quando
page=2/limit=5, demais listas ignoravam paginação. O baseline completo foi
reproduzido também em snapshot isolado do HEAD inicial, incluindo referências e
reviews. Fixtures e banco reais não utilizados. Números abaixo do snapshot:

| Route | Dataset | Antes: status / returned | Queries | Payload bytes |
| --- | --- | --- | --- | --- |
| /products?limit=999999 | 55 | 200 / 12 | 3 | 246406 |
| /admin/products?page=2&limit=5 | 55 | 200 / 55 | 2 | 1135876 |
| /admin/users?page=2&limit=5 | 56 | 200 / 56 | 2 | 16771 |
| /admin/orders?page=2&limit=5 | 55 | 200 / 55 | 2 | 56782 |
| /orders/me?page=2&limit=5 | 55 | 200 / 55 | 2 | 53212 |
| /reviews?productId=FIXTURE_ID&limit=5 | 54 | 200 / 54 | 1 | 6940 |
| /categories | 1001 | 200 / 1001 | 1 | 112034 |
| /admin/categories | 1001 | 200 / 1001 | 2 | 112034 |
| /addresses | 101 | 200 / 101 | 2 | 35067 |

Antes, explain de find/sort/limit(5) em Products/Orders/Users: SORT + COLLSCAN,
5 retornados, 0 keys examinadas, 55/55/56 documentos examinados.

## Endpoints já protegidos antes da task

Catálogo já tinha páginas fixas de 12 e sort createdAt/_id. Não aceitava limite
enorme como tamanho efetivo, mas ignorava limit. Busca já escapava regex; literal
.* retornava zero. Operador price[$ne] já era 400. Audit já tinha default 25,
máximo 100, filtros estritos, sort estável, auth/no-store/DTO F025; foi integrado
ao parser central e ganhou teto de offset/booleans. Não se alegou regex arbitrária
ou audit ilimitado como finding novo. Addresses já tinham sort estável/ownership,
mas sem teto. Categories já tinham ordem estável, mas sem teto.

## Estratégia e pagination contract

Parser central, filtros/sorts allowlisted, projeções lean com serializers explícitos,
query/count em paralelo, índices por consulta, controles frontend por página.
Default page=1; default limit=25, catálogo=12; max limit=100; max skip=100000.
Inválidos: zero, negativo, fração, NaN/Infinity, expoente, espaços, letras,
inteiro inseguro, arrays/objetos, duplicatas, operadores e parâmetros desconhecidos.
400 INVALID_PAGINATION/INVALID_QUERY; offset 400 PAGINATION_RANGE_TOO_LARGE.

## Response contract e stable sorting

success + array nomeado + pagination{page,limit,total,pages,hasNext,hasPrevious}.
Página além do total: 200/array vazio. Catálogo preserva productsCount,
filteredProductsCount/resultPerPage. Admin orders preserva totalAmountCents e
decimal global do filtro por aggregate, sem somar só a página. Referências:
1000 categories/100 addresses; overflow integral 503 REFERENCE_SET_TOO_LARGE.
createdAt com _id na mesma direção; Audit DESC, categories ASC, addresses favorite
DESC/createdAt DESC/_id DESC. Reviews preservam posição estável F015 no array.

## Query safety

Allowed filters: keyword/category/price e ratings comparações conhecidas; users
status active/deactivated/all; orders archived active/archived/all e status
Processing/Shipped/Delivered; Audit contrato F025; categories parent_id; reviews
productId ou id. Addresses sempre user da sessão. Sort allowlist newest/oldest
em Products/Users/Orders; demais fixos. **Mongo operators from client: NÃO.**
Duplicatas/arrays/brackets desconhecidos rejeitados também no URL bruto.

## Product search

Substring literal case-insensitive, trim, keyword max=100. **Regex escaped: SIM.**
Índice usado nos probes: products_recent para sort; não indexa substring.
**Residual full scan: SIM** — termo ausente examina 2000 docs/keys mesmo com IXSCAN.
Fallback monetário legado usa $expr estrito e pode exigir scan. Sem alteração para
$text/Atlas/tokenização; residual de escala/search permanece no âmbito de F038.

## Payload optimization

Products: card/resumo, uma imagem, sem description/reviews/user/ledger internos;
detalhe conserva tudo e edição busca detalhe. Orders: status/pagamento/total,
sem itens/snapshot/endereço/hash/provider ID; detalhe conserva snapshot/PII
conforme ownership/F011. Users: DTO allowlist sem password/reset/tokenVersion/
avatarRevision/fence, com metadata admin F016. Audit: DTO/projeção/metadata F025.
Lean não pula apresentação F014. Total global valida centavos mesmo fora da página.

## N+1

Auditados Products público/admin, Orders cliente/admin, Users, Audit, Categories,
Addresses e Reviews. Nenhum populate/find por item nas listagens. Detalhe de Order
continua populate único de User, um recurso. Teste 5 versus 50 verifica queries
constantes. Count/total globais não são O(limit); são consultas agregadas constantes.
Products público=3 (+1 filtro category), admin products/users/customer orders=3
incluindo auth; admin orders=4 incluindo aggregate; Audit=3 incluindo auth.

## Index inventory

| Collection | Index | Keys / query supported | Existing/New |
| --- | --- | --- | --- |
| products | products_recent | `{"createdAt":-1,"_id":-1}` | New |
| products | products_category_recent | `{"category_id":1,"createdAt":-1,"_id":-1}` | New |
| products | products_legacy_category_recent | `{"category":1,"createdAt":-1,"_id":-1}` | New |
| orders | orders_recent | `{"createdAt":-1,"_id":-1}` | New |
| orders | orders_customer_recent | `{"user":1,"createdAt":-1,"_id":-1}` | New |
| orders | orders_archive_recent | `{"administrativeArchivedAt":1,"createdAt":-1,"_id":-1}` | New |
| users | users_recent | `{"createdAt":-1,"_id":-1}` | New |
| users | users_status_recent | `{"accountStatus":1,"createdAt":-1,"_id":-1}` | New |
| categories | categories_tree | `{"createdAt":1,"_id":1}` | New |
| categories | categories_parent_tree | `{"parent_id":1,"createdAt":1,"_id":1}` | New |
| addresses | addresses_customer_favorite | `{"user":1,"favorite":-1,"createdAt":-1,"_id":-1}` | New |
| adminauditevents | audit_request_recent | `{"requestId":1,"createdAt":-1,"_id":-1}` | New |
| stockmovements | one_order_product_reserve | `{"order":1,"product":1,"type":1}` | Existing invariant/F025 |
| orderidempotencies | one_order_intent | `{"user":1,"operation":1,"keyHash":1}` | Existing invariant/F025 |
| stockmovements | product_1 | `{"product":1}` | Existing invariant/F025 |
| orders | one_order_per_key | `{"user":1,"idempotencyKeyHash":1}` | Existing invariant/F025 |
| users | email_1 | `{"email":1}` | Existing invariant/F025 |
| categories | name_key_1 | `{"name_key":1}` | Existing invariant/F025 |
| addresses | one_favorite_per_user | `{"user":1}` | Existing invariant/F025 |
| authratelimits | expiresAt_1 | `{"expiresAt":1}` | Existing invariant/F025 |
| mediacleanuptasks | provider_1_publicId_1 | `{"provider":1,"publicId":1}` | Existing invariant/F025 |
| mediauploadintents | publicId_1 | `{"publicId":1}` | Existing invariant/F025 |
| mediacleanuptasks | status_1_updatedAt_1 | `{"status":1,"updatedAt":1}` | Existing invariant/F025 |
| mediauploadintents | status_1_updatedAt_1 | `{"status":1,"updatedAt":1}` | Existing invariant/F025 |
| adminauditevents | createdAt_-1__id_-1 | `{"createdAt":-1,"_id":-1}` | Existing invariant/F025 |
| adminauditevents | action_1_createdAt_-1__id_-1 | `{"action":1,"createdAt":-1,"_id":-1}` | Existing invariant/F025 |
| adminauditevents | targetType_1_targetId_1_createdAt_-1__id_-1 | `{"targetType":1,"targetId":1,"createdAt":-1,"_id":-1}` | Existing invariant/F025 |
| adminauditevents | actorUserId_1_createdAt_-1__id_-1 | `{"actorUserId":1,"createdAt":-1,"_id":-1}` | Existing invariant/F025 |

Singletons de locks/hierarchy: somente _id. Índices redundantes de prefixo antigos
não são declarados novos nem removidos automaticamente. Extras preservados.

## Explain results

Fixtures temporárias: 2000 Products, 2000 Orders, 1000 Users; categorias/endereços/
audit adicionais válidos para planos das referências/F025. Sem PII no relatório.

| Query | Index | nReturned | totalKeysExamined | totalDocsExamined |
| --- | --- | --- | --- | --- |
| products latest | products_recent | 25 | 25 | 25 |
| products category | products_category_recent | 25 | 25 | 25 |
| products legacy category | products_legacy_category_recent | 25 | 25 | 25 |
| orders customer | orders_customer_recent | 25 | 25 | 25 |
| orders admin active | orders_archive_recent | 25 | 25 | 25 |
| orders all | orders_recent | 25 | 25 | 25 |
| users active | users_status_recent | 25 | 25 | 25 |
| users all | users_recent | 25 | 25 | 25 |
| users legacy active | users_status_recent, users_status_recent | 25 | 25 | 25 |
| products offset1000 | products_recent | 25 | 1025 | 25 |
| substring sem resultado (residual F038) | products_recent | 0 | 2000 | 2000 |
| categories tree | categories_tree | 25 | 25 | 25 |
| categories parent | categories_parent_tree | 25 | 25 | 25 |
| addresses customer | addresses_customer_favorite | 25 | 25 | 25 |
| audit request | audit_request_recent | 25 | 25 | 25 |

Queries principais: IXSCAN sem SORT em memória. Offset examina skip+limit keys.
Archived/ranges/status adicionais e count exato podem custar mais; não se promete
planos uniformes em qualquer combinação/dataset. Sem explain pesado no fetech.

## Index migration

Comando: npm.cmd run migrate:indexes --prefix ecommerce. Default e --dry-run:
somente inventário. Apply: -- --apply --confirm-db NOME_EXATO; confirmação literal
antes de conexão. **Idempotent: SIM** (segunda execução no-op testada).
**Automatic drop: NÃO. syncIndexes production: NÃO.** Divergência de key/options
aborta apply inteiro antes dos createIndex; sem troca silenciosa de unique/partial/
TTL/collation/hidden. Índices equivalentes respeitados e extras preservados.
Runtime autoIndex/autoCreate desativados; ambientes novos dependem de provisionamento. Startup verifica metadata de índices únicos em modo somente leitura e recusa integridade ausente/divergente antes de ouvir HTTP. Ledger amplo antigo protege reservas e mantém gate F037; índices de performance ausentes não são criados implicitamente. Boot real isolado após migration foi verificado.

## F037 ledger index — PENDING PRODUCTION INDEX OPERATIONS

Esperado: one_order_product_reserve unique order/product/type, partial type=RESERVE,
mais product_1. Índice antigo one_order_product_movement exige drop explícito
**depois** da criação da nova proteção. Migration F022 reporta pendência, não dropa.
Procedimento: npm.cmd run upgrade:stock-index --prefix ecommerce --
--confirm-database NOME_EXATO, conforme COERENCIA_PRODUTOS.md.
**Estado de produção verificado: NÃO. Executada no banco real: NÃO.**
Deployment prerequisite: validar F024 backup/restore e executar rollout de índices
com revisão operacional. F037 não perde seu gate PRODUCT_STOCK_LEDGER_INDEX_REQUIRED.

## audit:indexes

Comando: npm.cmd run audit:indexes --prefix ecommerce.
Mode: **READ-ONLY**. Banco usado: **TEMPORÁRIO**.
Perfil mínimo NODE_ENV/DB_URI, sem segredos comerciais necessários. CLI testado em
DB do runner isolado. Não importa models; imprime só collection/name/keys/status.
Não cria/dropa/repara; flags de mutation recusadas, URI/documentos não aparecem.

## Frontend e stale requests

Catálogo: URL page, filtros resetam 1, legacy 12 preservado; abort e identidade
antes de dispatch. Dashboard Products/Orders/Users: páginas de 25, contadores por
metadata.total, filtros lifecycle/archive resetam 1; sequência e AbortController
descartam respostas antigas. Editor busca detalhe completo. Customer Orders:
páginas de 25, aborto e guardas de resultado/finally. Audit conserva seus controles
e proteção preexistentes. Sem fetch de todas as páginas/cache/dependência nova.
Mocks testam sucesso/erro antigo até quando transporte ignora abort; E2E navega
páginas/filtros e resposta antiga. Auditoria já coberta por E2E F025 preservado.

## Probes após correção

| Route | Status / returned | Queries | Payload bytes |
| --- | --- | --- | --- |
| /products?limit=999999 | 400 / — | 0 | 93 |
| /admin/products?page=2&limit=5 | 200 / 5 | 3 | 2549 |
| /admin/users?page=2&limit=5 | 200 / 5 | 3 | 1486 |
| /admin/orders?page=2&limit=5 | 200 / 5 | 4 | 1922 |
| /orders/me?page=2&limit=5 | 200 / 5 | 3 | 1552 |
| /products?keyword=.* | 200 / 0 | 3 | 185 |
| /products?price[$ne]=1 | 400 / — | 0 | 88 |

- Oversized limit: 400 antes de Mongo (0 queries públicas).
- Injection: price[$ne] 400; arrays/objetos/duplicatas/unknown/sort inválido testados.
- Regex safety: literal .* não vira wildcard; (a+)+$/[x] retornam somente literal.
- Product/Order/Users list: 5 itens, resumo, queries constantes e metadata correta.
- N+1: mesmo número de queries 5/50 por rota.
- Explain: tabela acima, fixtures temporárias, residual explícito.
- Migration: dry-run, confirmação, apply aditivo, segunda aplicação no-op,
  divergência bloqueada, ledger antigo preservado. Audit CLI readonly validada.

## Arquivos criados / alterados e testes individuais

### Arquivos criados

- docs/PAGINACAO_E_PERFORMANCE_API.md
- docs/RELATORIO_FET_PERF_001.md
- docs/TESTES_FET_PERF_001.md
- ecommerce/backend/scripts/auditIndexes.js
- ecommerce/backend/scripts/indexes.js
- ecommerce/backend/utils/indexOperations.js
- ecommerce/backend/utils/listQueries.js
- ecommerce/backend/utils/orderList.js
- ecommerce/backend/utils/pagination.js
- ecommerce/backend/utils/queryIndexes.js
- ecommerce/tests/apiPagination.test.js
- ecommerce/tests/e2e/pagination.spec.js
- ecommerce/tests/frontendPaginationStale.test.js
- ecommerce/tests/helpers/paginationE2EFixture.js
- ecommerce/tests/helpers/paginationFixture.js
- ecommerce/tests/indexMigration.test.js
- ecommerce/tests/queryPerformanceIndexes.test.js
- ecommerce/tests/querySafety.test.js

### Arquivos alterados

- ROTAS.md
- docs/COERENCIA_PRODUTOS.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/HIERARQUIA_CATEGORIAS.md
- docs/HISTORICO_PEDIDOS.md
- docs/LIFECYCLE_USUARIOS.md
- docs/OBSERVABILIDADE.md
- docs/PLANO_MELHORIAS_FETECH.md
- ecommerce/backend/config/database.js
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/addressController.js
- ecommerce/backend/controllers/categoryController.js
- ecommerce/backend/controllers/orderController.js
- ecommerce/backend/controllers/productController.js
- ecommerce/backend/controllers/userController.js
- ecommerce/backend/middleware/erros.js
- ecommerce/backend/models/addressModel.js
- ecommerce/backend/models/adminAuditEventModel.js
- ecommerce/backend/models/categoryModel.js
- ecommerce/backend/models/orderModel.js
- ecommerce/backend/models/productModel.js
- ecommerce/backend/models/userModel.js
- ecommerce/backend/routes/adminAuditRoute.js
- ecommerce/backend/server.js
- ecommerce/backend/utils/apiFeatures.js
- ecommerce/frontend/src/actions/productAction.js
- ecommerce/frontend/src/component/Admin/Dashboard.jsx
- ecommerce/frontend/src/component/Order/Orders.jsx
- ecommerce/package.json
- ecommerce/tests/adminAudit.test.js
- ecommerce/tests/api.test.js
- ecommerce/tests/checkoutValidation.test.js
- ecommerce/tests/configSecurity.test.js
- ecommerce/tests/e2e/orderIdempotency.spec.js

[Testes individuais: 164 + seis E2E](TESTES_FET_PERF_001.md). Os quatro testes antigos de API e um E2E foram adaptados ao novo contrato preservando verificações de segurança/snapshot nos detalhes.

## Dependências adicionadas

**NENHUMA.** package.json recebeu somente dois scripts; lockfiles preservados.

## Validação final

| Verificação | Comando executado | Resultado |
|---|---|---|
| Focused pagination/query safety | node ecommerce/tests/runWithReplicaSet.js --test tests/apiPagination.test.js tests/querySafety.test.js | 130/130 no primeiro conjunto; API atual 21 + safety110 |
| Focused indexes/performance/migration | node ecommerce/tests/runWithReplicaSet.js --test tests/apiPagination.test.js tests/queryPerformanceIndexes.test.js tests/indexMigration.test.js | 51/51; posteriormente startup/config62/62 |
| Focused startup/config | node ecommerce/tests/runWithReplicaSet.js --test tests/indexMigration.test.js tests/configSecurity.test.js | 62/62; full final também valida startup real isolado após provisionamento |
| Mock stale response | node --test ecommerce/tests/frontendPaginationStale.test.js | 2/2 |
| API completa | npm.cmd test --prefix ecommerce | **1484 aprovados, 15 skips, 0 falhas; 1499 casos** |
| Build | npm.cmd run build --prefix ecommerce/frontend | **aprovado** |
| E2E focused | node ecommerce/tests/runWithReplicaSet.js node_modules/@playwright/test/cli.js test pagination.spec.js orderIdempotency.spec.js | **8/8** |
| E2E completo | npm.cmd run test:e2e --prefix ecommerce | **57/57** |
| Diff | git diff --check | **aprovado** |
| Audit | npm.cmd audit --prefix ecommerce --json | **0 vulnerabilidades** |

F024 skips: **15**, continuam exclusivamente ligados à ausência de mongodump/
mongorestore. Nenhum download/drill ou audit fix. Build emite somente avisos do
ambiente; E2E avisos NO_COLOR/FORCE_COLOR, sem erro de CSP. Dependências/locks
inalterados. Validação inicial apontou assertions antigas incompatíveis com o
DTO/paginação e seletores E2E novos em idioma/rota incorretos; corrigidos, sem
relaxar ownership, idempotência, snapshots ou validações comerciais.

## Banco real, config.env e auditoria histórica

**BANCO fetech NÃO ALTERADO.** Nenhuma migration, seed, repair, audit:indexes ou
explain comercial executado. **NENHUMA MIGRATION DE ÍNDICE EXECUTADA NO BANCO
COMERCIAL.** Aplicação real não reiniciada. **CONFIG.ENV NÃO SOBRESCRITO.**
**AUDITORIA HISTÓRICA NÃO ALTERADA.** Todas as operações de fixture/índice/explain
foram isoladas em replica sets/dbs temporários. Alterações fora de escopo: NENHUMA.

## Compatibilidade e riscos residuais

Admin products/users/orders, customer orders e reviews passam a paginar default25,
max100. Catálogo default12 com limit opcional. Params antes ignorados passam a
400. Metadata nova é aditiva; campos legacy de catálogo/totalAmount preservados.
Snapshots/reviews/descriptions completos ficam nos detalhes; frontends atualizados.
Categories e addresses têm teto explícito, sem resposta truncada. Nenhum índice
comercial aplicado. Busca substring/monetário legado e count/total exatos podem
examinar o conjunto filtrado; escala maior pode exigir cursor/search especializado.
Índices de código dependem de aplicação comercial; ledger F037 continua gate.
F024 precisa de restore validado antes das migrations reais. F038 não foi encerrado.

## Status da remediação

- **F002: CONTINUA CORRIGIDO.**
- **F003: CONTINUA CORRIGIDO.**
- **F004: CONTINUA CORRIGIDO.**
- **F005: CONTINUA CORRIGIDO.**
- **F006: CONTINUA CORRIGIDO.**
- **F007: CONTINUA CORRIGIDO.**
- **F008: CONTINUA CORRIGIDO.**
- **F009: CONTINUA CORRIGIDO.**
- **F010: CONTINUA CORRIGIDO.**
- **F011: CONTINUA CORRIGIDO.**
- **F012: CONTINUA CORRIGIDO.**
- **F013: CONTINUA CORRIGIDO.**
- **F014: CONTINUA CORRIGIDO.**
- **F015: CONTINUA CORRIGIDO.**
- **F016: CONTINUA CORRIGIDO.**
- **F017: CONTINUA CORRIGIDO.**
- **F018: CONTINUA CORRIGIDO.**
- **F020: CONTINUA CORRIGIDO.**
- **F021: CONTINUA CORRIGIDO.**
- **F025: CONTINUA CORRIGIDO.**
- **F031: CONTINUA CORRIGIDO.**
- **F036: CONTINUA CORRIGIDO.**
- **F019: CONTINUA CORRIGIDO PARA NOVAS SUBSTITUIÇÕES.**
- **F037: CONTINUA CORRIGIDO NO CÓDIGO; ÍNDICE DO LEDGER AINDA É PRÉ-REQUISITO DE DEPLOYMENT.**
- **F024: CONTINUA PARCIAL.** 15 skips exclusivos mongodump/mongorestore ausentes.
- **F029 e F030: CONTINUAM ABERTOS.**
- **F001 pagamento e F027 frete: ADIADOS, NÃO INICIADOS.**
- **F038/F039: sem encerramento nesta task.**
- **F022: CORRIGIDO NO CÓDIGO.**

## Próxima task recomendada

**F039 — gates formais de CI:** inventariar cobertura existente, preencher lacunas
de suites críticas/banco isolado/build/E2E/architecture e bloqueio antes de merge/
deploy. F024 parcial e F001/F027 adiados. **Não iniciada automaticamente.**
