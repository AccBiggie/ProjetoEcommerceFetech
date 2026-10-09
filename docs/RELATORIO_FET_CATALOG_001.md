# Relatório FET-CATALOG-001 — F037

## Resultado, branch, HEAD e worktree

**CONCLUÍDO — CORRIGIDO NO CÓDIGO.** Branch main. HEAD inicial e final:
af5275a7ca898f4a1fe6fc1d6f56c64cf16d44eb. F031 já estava commitada.
Worktree inicial limpo; nenhuma alteração anterior descartada. Esta task permanece
sem commit. O banco fetech e a aplicação existente não foram migrados/reiniciados.
Rollout real exige atualização explícita do índice descrita abaixo.

## Inventário Product

Inspecionados: schema, controllers/routes, formulário create/edit Dashboard,
ProductCard/ProductDetails, cartDomain/safeStorage F031, money backend/shared/frontend,
Category/hierarchy F017, reviews F015, seed, migração monetária e audits existentes.
Pesquisados os campos reais money/off/Stock/category/images/reviews e todos os
writes de Product/StockMovement. Não existem SKU, updatedAt, archive ou upload
dedicado de Product. user tem o typo histórico require no schema; o endpoint
sempre usa o admin autenticado e o campo não pertence à allowlist.

| Campo real | Persistido? | Entrada HTTP? | Derivado? | Fonte de verdade / regra |
| --- | --- | --- | --- | --- |
| `_id`, `__v` | Sim | Não | Sistema | Mongo/Mongoose |
| `name`, `description` | Sim | Sim | Não | String com trim, não vazia, Unicode; sem limite novo ou unicidade inventada |
| `countDown` | Sim | Sim | Não | String não vazia, máximo existente de 50 caracteres; não é utilizada como regra comercial pelo frontend atual |
| `price` | Somente legado | Sim | Na resposta | F014 parse estrito; no máximo duas casas, sem arredondar |
| `priceCents` | Sim | Não | Da entrada `price` | Inteiro seguro >= 0; preço zero preservado pelo caso comercial API-MONEY-22 |
| `oldPrice` | Somente legado | Sim, inclusive null | Na resposta | Referência opcional; null remove desconto |
| `oldPriceCents` | Sim, nullable | Não | Da entrada `oldPrice` | Null ou >= priceCents; igualdade permite desconto zero, conforme fallback do formulário anterior |
| `off` | Sim | Não | Sim | Percentual inteiro, arredondamento half-up, calculado em BigInt |
| `installmmentPrice` | Somente legado | Não | Na resposta | Spelling histórico mantido |
| `installmmentPriceCents` | Sim | Não | Sim | Primeira parcela de `splitInstallments(priceCents, 12)`; resto distribuído nas primeiras parcelas |
| `Stock` | Sim | Sim | Não | Available-to-sell, Number inteiro seguro >= 0 |
| `stockLedgerVersion` | Sim nos novos produtos | Não | Sistema | Versão 1 declara baseline completo a partir da criação |
| `category_id` | Sim nos novos writes | Sim | Resolvido | Category existente, sob coordenação F017 |
| `category` | Sim | Sim por compatibilidade | Nome resolvido | Cópia de Category.name; ID e nome divergentes são rejeitados |
| `images[].public_id`, `url`, `banner` | Sim | Sim | Não | Metadados validados; array vazio permitido pelo fallback atual |
| `images[]._id` | Sim | Não | Sistema | ID de subdocumento Mongoose |
| `reviews[]._id`, `user`, `name`, `rating`, `comment` | Sim | Somente serviço de reviews | F015 | Endpoint genérico de Product rejeita reviews |
| `ratings`, `numOfReviews` | Sim | Não | Sim | Array final de reviews, pipeline atômico F015 |
| `user`, `createdAt` | Sim | Não | Sistema | Admin autenticado e relógio do servidor |


## Finding reproduzido antes da correção

Probes HTTP com admin e Mongo temporário, no HEAD original, antes de alterar runtime:

| Entrada / operação | Status anterior | Estado observado | Incoerência |
| --- | --- | --- | --- |
| price=150.00, oldPrice=120.00 | 201 | priceCents=15000, oldPriceCents=12000, off=17, parcela=833 | Referência abaixo do preço e derivados independentes |
| off=99 com price=100, old=120 | 201 | off=99 | Desconto real arredondado seria 17 |
| installmmentPrice=1.00 com price=100 | 201 | parcela=100 cents | Plano existente de 12 partes exige primeira parcela=834 |
| category_id=Hardware, category=Outra | 201 | Server escolheu Hardware | Divergência enviada era silenciosamente aceita |
| URL javascript e banner HTTP | 201 | Metadata persistida | Schema validava presença, sem estrutura segura de URL |
| Admin target Stock=15 | 200 | 0 StockMovements | Nova alteração administrativa invisível no ledger |
| DELETE com StockMovement existente | 200 | 1 movimento órfão | Referência Product perdida |

Stock negativo/fracionário retornava 400: **já protegido**, não finding novo.
Spoof de ratings/reviews/numOfReviews retornava 201 com agregados 0/array vazio:
**já ignorado pela allowlist**, sem adulteração. F014 já fazia parse/cents estritos,
F015 já usava pipeline atômico, F017 já resolvia Category e sincronizava rename
com Product dentro da transação. Não reivindicamos corrigir novamente essas bases.

## Causa raiz e estratégia

Campos comerciais eram aceitos independentemente; desconto/parcela estavam
calculados separadamente na UI e no seed. O update auditado não registrava
ajustes de estoque e DELETE não consultava referências. A allowlist existente
protegia internals/reviews, mas incluía campos derivados e ignorava tentativas
indevidas sem erro explícito. A correção centraliza coerência, sem inventar
regra financeira, upload de Product, SKU ou archive.

## Product domain layer e mass assignment

Arquivos: backend/utils/productDomain.js e services/productMutationService.js.
Create/update/seed compartilham parse F014, allowlist, texto, relação monetária,
derivação, Stock, metadata e resolução F017. Controllers fazem preflight de
entrada; validação integral usa estado atual dentro da transaction. Updates
usam $set/$unset restritos, sem save stale de arrays/Stock.

Allowlist create/update: name, description, price, oldPrice, Stock, category,
category_id, images, countDown. Bloqueados, com 400 PRODUCT_FIELD_NOT_MUTABLE:
_id, __v, createdAt, updatedAt, user, todos os cents/derivados, off,
installmmentPrice, reviews, ratings, numOfReviews, stockLedgerVersion,
hierarchy/audit internals, operadores e qualquer campo desconhecido.

## Money, price relation, desconto e installment

priceCents: inteiro seguro >=0; o teste comercial pré-existente API-MONEY-22
justifica manter zero. HTTP continua decimal explícito estrito com até duas
casas, sem multiplicação/arredondamento em float. oldPriceCents: null ou >=current;
igualdade é compatível com o fallback anterior do formulário e produz off=0.
Old abaixo de current: 400 PRODUCT_PRICE_RELATION_INVALID. Null remove referência
e limpa o desconto. Tipo/precisão/overflow inválidos não persistem.

off é percentual inteiro derivado server-side, NÃO controlável pelo cliente.
Fórmula half-up em BigInt: floor(((old-current)*200+old)/(2*old)); null/zero dá 0.
Alterar qualquer preço recalcula off. Parcelamento: campos com typo histórico
installmmentPrice/installmmentPriceCents preservados. Política encontrada: primeira
das 12 parcelas de splitInstallments, com resto nas primeiras partes; soma exata
em cents. Exemplo price=100.00 resulta em primeira parcela 8.34. Não foi inventada
política de pagamento/juros: continua ilustração da UI, F001 adiado.

Serializer único mantém cents e price/oldPrice/installmmentPrice decimais derivados,
com oldPrice=null quando não há referência. Legado decimal válido permanece legível
com moneyLegacy, sem escrita/recalcular seu valor histórico na leitura. ProductMoney
e o script histórico de migração foram preservados. Cart continua usando priceCents
e os envelopes F031 existentes; não mudou o formato do carrinho nem o seu storage.
Não houve mudança desnecessária em PERSISTENCIA_FRONTEND.md.

## Stock e StockMovement

Semântica: **AVAILABLE-TO-SELL**, Number seguro >=0, sem coerção. Admin envia
target absoluto; na transaction current é relido e delta=target-current é
registrado. Price/category/reviews não redefinem Stock quando não solicitado.
Ledger estendido: SIM. RESERVE permanece inalterado, com order/quantity/version1.
Novos tipos INITIAL_STOCK e ADMIN_ADJUSTMENT usam delta, stockBefore/stockAfter,
actorUserId e reason técnico. Ajustes não exigem Order nem texto livre/PII.

Novo Product stockLedgerVersion=1 declara baseline completo. Stock>0 gera
INITIAL_STOCK desde zero; Stock=0 não gera delta inútil. Target inalterado também
não gera movimento. Deltas positivos e negativos são seguros. Legado sem marker
não finge ter ledger completo: primeiro ajuste registra stockBefore atual e delta,
sem reconstruir histórico. Audit valida individualmente esses movimentos e informa
legacyLedgerProducts; só soma toda a história quando há baseline completo.

## Stock concurrency, categoria e reviews

Reserve/admin escrevem o mesmo Product e entram em conflito/retry real. Callback
reexecutado lê current atualizado; alvo administrativo vale na ordem de serialização.
Lost update: NÃO. Stock negativo: NÃO. Dez intents concorrentes e duas APIs/processos
independentes foram testados. Retry abortado não duplica Movement/AuditEvent.

category_id é a referência; category é cópia do nome resolvido. Ambos enviados
devem representar a mesma Category: caso contrário 400 PRODUCT_CATEGORY_MISMATCH.
Todos os writes administrativos de Product revalidam categoria e coordenam F017,
inclusive parciais/delete. Rename já sincronizava Product.updateMany na mesma TX;
preservado e testado contra create/category-update/name-update e falha de sync.
Leituras/reviews/Order não adquirem state de hierarquia. Custo de coordenação
administrativa global documentado; F022 não foi iniciado.

Admin genérico pode alterar reviews: NÃO. ratings/numOfReviews continuam derivados
do array final pelo serviço F015. Preço vs 20 reviews preservou price novo, 20 reviews,
count=20 e ratings=3. Históricos incoerentes são recusados com 409 sem repair.

## Images e frontend

Schema real: [{public_id,url,banner}] com _id de subdocumento. Metadata direta
administrativa; não existe endpoint de upload de Product. String não vazia,
identificadores únicos, HTTPS sem credenciais ou assets locais existentes
(/demo-products/<arquivo>, /Profile.png, /logo192.png), sem traversal/extra fields.
Array vazio continua legítimo por fallback. Nenhum fetch/provider real foi chamado.
Ownership/availability de assets externos não foram comprovados; F029 segue aberto.

Dashboard envia apenas campos permitidos, oldPrice opcional/null e target Stock.
Não calcula autoridade de off/parcela no payload. Errors específicos aparecem em
pt-BR; reviews/agregados/internals não são editáveis. Nenhum raw localStorage parse
foi reintroduzido. E2E validou persistência após reload, preço/Stock/categoria,
preservação de reviews, relação inválida sem save e delete protegido, com CSP/CSRF.

## Product delete, histórico e risco residual

Antes: physical delete podia deixar StockMovement órfão. Agora 409 PRODUCT_IN_USE
com qualquer StockMovement/Order, inclusive histórico arquivado; 404 ausente;
200 só sem essas referências. Race delete/reserve não cria órfão. Se Product
desaparece depois do preflight de Order, F005 pode manter PROCESSING e devolver
503 ORDER_TRANSACTION_UNAVAILABLE; preservamos a política de commit/incerteza.
Orders existentes conservam preço/nome/imagem de snapshot; nada foi reescrito.

Risco/limite: produto com ledger inicial permanece protegido mesmo com Stock=0.
Não existe archive de Product; lifecycle amplo futuro é tarefa separada. Nenhum
órfão histórico foi reparado. O teardown E2E remove apenas fixtures em database
temporária cujo URI/replica set são confirmados contra o runner; não é uma rota
da aplicação nem uma forma comercial de contornar esse guard.

## Índice, implantação e F024

Índice antigo único (order,product,type) abrangia order ausente e impediria
o segundo ajuste do mesmo Product. Novo one_order_product_reserve é único
somente para RESERVE. Upgrade explícito idempotente cria essa proteção antes
de retirar o índice antigo; também mantém índice de product para referências.
Não modifica documentos. Sem migração automática no startup. Create/ajustes
falham fechados com 503 PRODUCT_STOCK_LEDGER_INDEX_REQUIRED se houver índice antigo.

Comando preparado, NÃO executado no fetech:

```powershell
npm.cmd run upgrade:stock-index --prefix ecommerce -- --confirm-database NOME_EXATO
```

Rollout real aguarda planejamento/autorização operacional. F024 permanece
PARCIAL: mongodump/mongorestore ausentes, sem download e sem restore drill real.
Testes sintéticos/read-only/index upgrade temporário não substituem esse gate.

## Audit F025 e audit:products

Actions preservadas: PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_DELETED.
Metadata contém somente changedFields; inclui derivados somente quando mudam.
Product + Movement + state F017 + evento commitam juntos; falhas depois de writes
e retries foram testados com rollback real. Logs permitem PRODUCT_* e Request ID
do servidor, sem descrição, imagem completa, body, JWT ou configurações de provider.

Comando:

```powershell
npm.cmd run audit:products --prefix ecommerce
```

Mode: **READ-ONLY**. Perfil products-audit mínimo F036, autoCreate/autoIndex false,
driver bruto e leituras em snapshot entre coleções; sem HTTP/SMTP/Cloudinary.
Todos os argumentos são rejeitados, inclusive --apply/--repair. Detecta
PRODUCT_PRICE_INVALID, PRODUCT_OLD_PRICE_INVALID, PRODUCT_DISCOUNT_MISMATCH,
PRODUCT_INSTALLMENT_MISMATCH, PRODUCT_STOCK_INVALID, PRODUCT_CATEGORY_MISMATCH,
PRODUCT_CATEGORY_MISSING, issues de assessReviews (count/rating/estrutura),
PRODUCT_IMAGE_INVALID, PRODUCT_IMAGE_DUPLICATE, PRODUCT_LEDGER_MISMATCH e
PRODUCT_LEDGER_ORPHAN. Não duplica o cálculo F015. Apenas IDs técnicos/códigos
e contagens no output. Provider calls: ZERO. Execução no banco real: NÃO.

Audit de inventory e de Order/backup reconhecem movimentos administrativos sem
inventar referência de Order. Verificador de backup mantém Product/actor e forma
do movimento, além das reservas e índices únicos. Snapshot audit foi testado com
ajuste commitando entre duas leituras; nenhuma falsa divergência.

## Probes pós-fix

As oito entradas negativas/comerciais/derivadas/category/images/reviews retornaram
400 com código específico; counts Product/Movement/Audit inalterados em cada probe.
Concurrency: respostas 200/201, Stock=9, soma do ledger=9;
INITIAL_STOCK: 0→1 (delta 1); ADMIN_ADJUSTMENT: 1→10 (delta 9); RESERVE: 10→9 (qty 1).
Review vs price: priceCents=1999, count=1, rating=5, ambos preservados.
Delete com ledger: 409 PRODUCT_IN_USE, Product preservado. Audit raw fixture
off=99 detectou PRODUCT_DISCOUNT_MISMATCH; writes=ZERO. Probes foram encerrados
com drop somente do database temporário e shutdown do replica set isolado.

## Arquivos criados

- docs/COERENCIA_PRODUTOS.md
- docs/RELATORIO_FET_CATALOG_001.md
- docs/TESTES_FET_CATALOG_001.md
- ecommerce/backend/scripts/auditProducts.js
- ecommerce/backend/scripts/upgradeStockLedgerIndex.js
- ecommerce/backend/services/productMutationService.js
- ecommerce/backend/utils/productAudit.js
- ecommerce/backend/utils/productDomain.js
- ecommerce/backend/utils/stockLedgerIndexes.js
- ecommerce/backend/utils/stockMovementContract.js
- ecommerce/tests/e2e/productCoherence.spec.js
- ecommerce/tests/helpers/productE2EFixture.js
- ecommerce/tests/helpers/productHarness.js
- ecommerce/tests/productAudit.test.js
- ecommerce/tests/productCoherence.test.js
- ecommerce/tests/productConcurrency.test.js

## Arquivos alterados

- ROTAS.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/ESTOQUE_TRANSACIONAL.md
- docs/HIERARQUIA_CATEGORIAS.md
- docs/MIGRACAO_DINHEIRO_CENTAVOS.md
- docs/OBSERVABILIDADE.md
- docs/PLANO_MELHORIAS_FETECH.md
- docs/REVIEWS_CONCORRENCIA.md
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/productController.js
- ecommerce/backend/middleware/erros.js
- ecommerce/backend/models/productModel.js
- ecommerce/backend/models/stockMovementModel.js
- ecommerce/backend/scripts/seedProducts.js
- ecommerce/backend/utils/backupVerification.js
- ecommerce/backend/utils/categories.js
- ecommerce/backend/utils/inventoryAudit.js
- ecommerce/backend/utils/money.js
- ecommerce/backend/utils/orderHistoryAudit.js
- ecommerce/frontend/src/component/Admin/Dashboard.jsx
- ecommerce/package.json
- ecommerce/tests/adminAudit.test.js
- ecommerce/tests/api.test.js
- ecommerce/tests/backupRestore.test.js
- ecommerce/tests/categoryHierarchy.test.js
- ecommerce/tests/categoryHierarchyConcurrency.test.js
- ecommerce/tests/configSecurity.test.js
- ecommerce/tests/e2e/money.spec.js
- ecommerce/tests/e2e/reviews.spec.js
- ecommerce/tests/e2e/routes.spec.js
- ecommerce/tests/fixtures.js
- ecommerce/tests/helpers/categoryHierarchyHarness.js
- ecommerce/tests/moneyApi.test.js
- ecommerce/tests/reviewConcurrency.test.js

Dependências adicionadas: **NENHUMA**. package.json recebeu dois comandos; lockfile
não mudou. npm audit executado: **0 vulnerabilidades**, sem audit fix.
Auditoria histórica original e config.env/migrateMoneyToCents.js preservados.

## Testes adicionados e validação

Lista individual: [98 casos e novo E2E](TESTES_FET_CATALOG_001.md), com mapeamento
dos 116 cenários solicitados e regressões F002–F036.

Focused coherence: **78/78**. Focused concurrency: **11/11**. Focused audit: **9/9**.
Os três arquivos foram executados na mesma chamada integrada com as regressões
de backup/order audit abaixo, não em chamadas individuais artificiais:

```powershell
cd ecommerce
node tests/runWithReplicaSet.js --test tests/productCoherence.test.js tests/productConcurrency.test.js tests/productAudit.test.js tests/backupRestore.test.js tests/orderHistoryAudit.test.js
```

Resultado integrado: **117 aprovados, 15 skips exclusivamente F024**, zero falhas.
Revalidação final de categoryHierarchyConcurrency.test.js: **14/14 aprovados**,
após remover do fixture de criação por ID um nome de categoria padrão que passou
a ser incompatível com a rejeição explícita de mismatch. A corrida voltou a
exercitar uma solicitação legítima por ID, sem enfraquecer a nova validação.
Regressões adicionais money migration/reviews + catálogo: 184 aprovados em uma
execução anterior às duas últimas adições de teste. Os 98 casos finais e todos
os fluxos novos estão cobertos na execução integrada e na suíte completa final.

| Validação | Comando | Resultado |
| --- | --- | --- |
| API completa | npm.cmd test --prefix ecommerce | **1.320 aprovados / 15 skips F024 / 0 falhas**, 1.335 testes |
| Build | npm.cmd run build --prefix ecommerce/frontend | **Aprovado, exit 0** |
| E2E | npm.cmd run test:e2e --prefix ecommerce | **51/51 aprovados**, CSP/CSRF e regressões existentes |
| Dependências | npm.cmd audit --prefix ecommerce | **0 vulnerabilidades**, nenhuma dependência nova |
| Diff | git diff --check | **Aprovado** |

Os 15 skips continuam exclusivamente ligados à ausência de mongodump/mongorestore.
Nenhuma Database Tool foi baixada. Warning conhecido de import dinâmico de store
no build permanece informativo; compilação e exit 0 confirmados. Segurança/storage
F031 continuaram aprovados, sem alterar formato/authority de cart/checkout.

## Compatibilidade, status dos findings e limites

F002–F018, F020/F021/F025/F031/F036 continuam corrigidos; F019 para novas
substituições de avatar. F024 PARCIAL, F029/F030 abertos. F001/F027 adiados e
não iniciados. Novos Product writes têm garantia; nenhum repair histórico real.
Não foi feita chamada Cloudinary/SMTP real, migration/audit comercial, alteração
de config.env, download de Tools, reset/clean, commit ou edição da auditoria original.
Checagem somente HTTP confirmou API existente com 12 produtos e frontend HTTP 200.
Backend existente não foi reiniciado: ativar código novo exige rollout/índice.

Documentação atualizada: contrato, estoque, hierarquia, reviews, referência F014,
rotas, observabilidade, estado atual/plano e este relatório. Próxima recomendação:
**F022 — performance/paginação**, sem início automático.
