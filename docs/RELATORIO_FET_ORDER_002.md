# Relatório FET-ORDER-002 — Reserva transacional de estoque

## Resultado

**CONCLUÍDO.** F003/F004 corrigidos para novos pedidos transacionais.
Não constitui aprovação geral para produção. Data: 08/10/2026.

## Branch

main

## HEAD inicial

c87c840d99deb8b3220e9a0bd3b831a7e79d75d9

## HEAD final

c87c840d99deb8b3220e9a0bd3b831a7e79d75d9 — esta task permanece sem commit.

## Estado do worktree

Inicial limpo: nenhum arquivo modificado/não rastreado. F005 já estava
commitada em c87c840, com título “Implementa idempotência persistente e
concorrente na criação de pedidos”. A informação de HEAD 22012da e F005
sem commit no anexo estava defasada. Alterações anteriores preservadas.
Final contém somente a implementação, testes e documentação listados abaixo.
Nenhum reset/clean/descarte/push/commit foi executado nesta task.

## Findings tratados

F003 / FET-P0-003 — overselling entre intenções distintas.
F004 / FET-P0-004 — atomicidade durável Order/Stock no novo protocolo.

## Finding F003 reproduzido antes da correção

Base temporária isolada, Stock inicial 1, duas requests concorrentes com
keys distintas: respostas [201,201], dois Orders, Stock final 1.
Fato do HEAD inicial: criação não reduzia Stock; a redução ocorria no envio.
Portanto o finding existe pela admissão de dois pedidos para uma unidade,
mesmo sem Stock negativo na etapa de criação. Probe executado antes de
alterar o fluxo comercial; fonte arquivada em .local/inventory-before-source.cjs.

## Finding F004 reproduzido antes da correção

Primeiro probe, antes do fix: reproduziu as writes separadas do fluxo de envio:
Product atualizado de 1 para 0, interrupção antes de salvar status do Order,
Order ainda Processing, nenhuma reserva durável. Criação do HEAD inicial não
possuía decremento: não foi inventada uma write de criação que não existia.
Evidência adicional: código real updateOrder do HEAD c87c840 foi carregado
em worker isolado e morto após findOneAndUpdate, antes de Order.save. Resultado
real de crash: Stock 0, Order Processing, zero movements. Compensação em memória
não executou. Esse segundo probe retrospectivo confirmou o código do HEAD inicial
sem restaurar/alterar arquivos do worktree. Log .local/inventory-before-crash.log.

## Causa raiz

Checkout fazia leitura/validação sem exclusão comercial e aceitava pedidos
sem reservar unidades. Envio gravava Products e Order separadamente e dependia
de compensação em processo. F005 impedia duplicação de uma intenção, mas não
disputa de disponibilidade entre intenções distintas.

## Estratégia implementada

Claim exclusiva antes das writes; Mongo withTransaction com revalidação no
snapshot; update condicional Stock >= quantity; ledger RESERVE; Order RESERVED;
completion da idempotência dentro do mesmo commit. ID estável entre retries,
produtos em ordem determinística, writes sequenciais e nenhum efeito externo.
Mongo comercial exige topologia transacional, sem fallback. Testes reais isolados.

## Mongo topology

Replica set ou mongos compatível. hello consulta sessões lógicas, setName/msg e
wire version. Executado depois da conexão e antes de prepare/listen. Standalone
real recusado, listen e prepare não chamados. Mensagem sem URI/hosts/credenciais:
“A API comercial exige MongoDB com suporte a transações.”
Scripts bootstrap/seed/audits mantêm requisitos próprios; sem migrations novas
de Products/Orders. init prepara índices, sem syncIndexes.

## Replica set de teste

mongod local existente .local/mongod.exe, single-node fetech_test_rs, porta
dinâmica, dbpath temporário .local/test-mongo-rs-*. Iniciação apenas no processo
temporário próprio. URI repassada pelo runner para databases com PID/timestamp.
finally encerra processo e remove somente caminho temporário validado. Também
testada instância standalone temporária. Nenhum dbpath real reutilizado.
Teardown confirmado: zero diretórios test-mongo-rs-* e .test-state.json ausente.
Banco real tocado: **NÃO**.

## Transaction

API: ClientSession.withTransaction. Opções: primary, snapshot, majority,
maxCommitTimeMS 10000, timeoutMS 30000. Driver resolve retries de write conflict
e UnknownTransactionCommitResult. Writes participantes: Product.Stock,
StockMovement RESERVE, Order e OrderIdempotency COMPLETED, mesma session.
Nenhuma Promise.all ou SMTP/Cloudinary/HTTP/filesystem dentro do callback.
Referência: [driver MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

## Product.Stock

Disponibilidade para novas reservas. Number safe integer >= 0. Endpoints
administrativos validam tipo real antes do casting; schema cast exige inteiro
seguro e min rejeita negativos em documentos. Deltas $inc negativos são aceitos.
Checkout lean detecta Stock legado inválido sem coercion/correção automática.
Boolean/string/float/negative/unsafe recusados; 0/1/10 aceitos.

## StockMovement

Model StockMovement, collection stockmovements. Campos product/order/type,
quantity > 0, stockBefore/stockAfter safe integers não negativos, version 1,
createdAt. Tipo comercial implementado: somente RESERVE. Equação validada.
Índice unique one_order_product_movement: order/product/type. Teste duplicado
usa novo _id e comprova keyPattern do índice composto. Não expõe internals
na API e não representa todo inventário anterior ao deploy.

## Order inventory state

inventoryStatus RESERVED, inventoryVersion 1, inventoryReservedAt, definidos
pelo servidor. Cliente não controla esses campos ou movements. Pagamento
continua Pending. Legados sem status são lidos/atualizados sem inventar histórico.

## Idempotency

Claim inicial PROCESSING fora da transaction; completion participa: **SIM**.
Novo sucesso depende do commit conjunto. Compatibilidade PROCESSING + Order
antigo salvo mantida e testada. Raw key não persistida, hashes não retornados.
FAILED de estoque retorna código terminal seguro. Erros operacionais ambíguos
mantêm PROCESSING, sem takeover; consulta Order/claim antes de decisão.
Frontend mantém key para rede/5xx/PROCESSING/conflito e encerra só estoque
insuficiente, preservando carrinho. Próximo submit explícito gera nova key.

## Overselling

| Caso | 201 | 409 estoque | Orders | RESERVE | Stock final |
| --- | --- | --- | --- | --- | --- |
| Stock 1 / duas intents | 1 | 1 | 1 | 1 | 0 |
| Stock 5 / dez intents | 5 | 5 | 5 | 5 | 0 |
| Stock 5 / qty 3 + qty 3 | 1 | 1 | 1 | 1 | 2 |

Stock nunca negativo; intents usam keys distintas, incluindo duas APIs em processos.

## Atomic rollback

Falhas após primeiro Product, todos reserves, movement, Order e completion:
todos Stocks originais, zero movements, zero Order, zero COMPLETED. Claims
operacionais permanecem PROCESSING; retries não executam nova criação.
Falha comercial conhecida retorna 409 e pode terminar FAILED fora da transaction.
Crash real: worker próprio morto antes de commit após writes Mongo; nenhum
Order/movement/Stock alterado visível. Só depois das asserções killSessions
encerra a sessão desse worker no Mongo temporário, permitindo teardown imediato.

## Delete Order

RESERVED: 409, Order/movements/Stock intactos; não libera unidades.
Legados: DELETE físico anterior mantido. **F011 CONTINUA ABERTO.**
Product delete continua físico; IDs/snapshots da reserva permanecem, mas
lifecycle de catálogo/post-sale ainda exige política própria.

## Shipping

Novo RESERVED decrementa Stock novamente: **NÃO**. Legados mantêm fluxo anterior,
incluindo seu mecanismo de compensação; sem inventar/migrar reservas históricas.
**F002 CONTINUA ABERTO**: envio ainda pode ocorrer com pagamento Pending.

## Audit inventory

Comando: npm.cmd run audit:inventory --prefix ecommerce.
Modo READ_ONLY, profile mínimo inventory-audit, autoIndex/autoCreate false.
Categorias: INVALID_STOCK, MISSING_RESERVE, ORPHAN_MOVEMENT, UNEXPECTED_MOVEMENT,
QUANTITY_MISMATCH, INCOHERENT_MOVEMENT, DUPLICATE_MOVEMENT,
MISSING_INVENTORY_STATUS, COMPLETED_WITHOUT_ORDER. Output só categorias/entidade/IDs,
sem nome/endereço/telefone/email/pagamento/key/hash. Sem saldo histórico inventado:
não prova reconciliação completa sem baseline nem detecta novo Order sem todos
os marcadores do protocolo. Banco real executado: **NÃO**.

## Arquivos criados

- docs/ESTOQUE_TRANSACIONAL.md
- docs/RELATORIO_FET_ORDER_002.md
- ecommerce/backend/config/mongoTransactions.js
- ecommerce/backend/models/stockMovementModel.js
- ecommerce/backend/scripts/auditInventory.js
- ecommerce/backend/services/orderInventoryService.js
- ecommerce/backend/utils/inventory.js
- ecommerce/backend/utils/inventoryAudit.js
- ecommerce/tests/e2e/zzInventory.spec.js
- ecommerce/tests/helpers/inventoryCrashWorker.js
- ecommerce/tests/inventoryAudit.test.js
- ecommerce/tests/inventoryTransaction.test.js
- ecommerce/tests/replicaSetHarness.js
- ecommerce/tests/runWithReplicaSet.js

## Arquivos alterados

- COMANDOS.md
- README.md
- ROTAS.md
- docs/CONFIGURACAO.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/IDEMPOTENCIA_PEDIDOS.md
- docs/PLANO_MELHORIAS_FETECH.md
- docs/VALIDACAO_CHECKOUT.md
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/orderController.js
- ecommerce/backend/controllers/productController.js
- ecommerce/backend/middleware/erros.js
- ecommerce/backend/models/orderModel.js
- ecommerce/backend/models/productModel.js
- ecommerce/backend/server.js
- ecommerce/backend/services/orderIdempotencyService.js
- ecommerce/frontend/src/component/Cart/Shipping.jsx
- ecommerce/package.json
- ecommerce/tests/adminSafety.test.js
- ecommerce/tests/api.test.js
- ecommerce/tests/authHarness.js
- ecommerce/tests/checkoutValidation.test.js
- ecommerce/tests/configSecurity.test.js
- ecommerce/tests/e2e/orderIdempotency.spec.js
- ecommerce/tests/e2e/routes.spec.js
- ecommerce/tests/e2e/server.js
- ecommerce/tests/e2e/teardown.js
- ecommerce/tests/fixtures.js
- ecommerce/tests/helpers/orderIdempotencyWorker.js
- ecommerce/tests/moneyMigration.test.js
- ecommerce/tests/orderIdempotency.test.js
- ecommerce/tests/rateLimit.test.js
- ecommerce/tests/shippingSnapshotAudit.test.js

## Dependências adicionadas

**NENHUMA.** package.json mudou somente scripts; lockfiles/dependências intactos.
Reutiliza mongod e Mongoose/driver instalados. Sem pacote Mongo em memória.

## Testes adicionados

36 casos de inventário transacional, 15 de auditoria, um cenário E2E novo.
Casos listados individualmente (execução real, sem skips):

- AUD-01 dados coerentes e legado sem baseline não são classificados inválidos
- AUD Stock inválido -1
- AUD Stock inválido 1.5
- AUD Stock inválido 9007199254740992
- AUD Stock inválido true
- AUD Stock inválido "10"
- AUD Stock inválido null
- AUD-08 identifica reserva ausente
- AUD-09 identifica movement órfão e claim COMPLETED sem Order
- AUD-10 identifica quantity divergente e before/after incoerentes
- AUD-11 duplicate movement e item inesperado detectados sem índice artificial
- AUD-12 novo protocolo sem inventoryStatus detectado
- AUD-13 documentos antes/depois idênticos e nenhuma PII/hash impresso
- AUD-14 CLI rejeita argumentos de escrita sem conectar
- AUD-15 CLI real usa perfil mínimo e só lê o banco temporário
- INV-01 topology real replica set suporta transações
- INV-02 standalone real recusa startup antes de prepare/listen sem dados sensíveis
- INV concorrência Stock=1, 2 intents distintas, qty=1
- INV concorrência Stock=5, 10 intents distintas, qty=1
- INV concorrência Stock=5, 2 intents distintas, qty=3
- INV multi-product atômico, linhas reversas concorrentes e ledger exato
- INV revalida Stock dentro da transaction e reverte multi-product
- INV rollback real: first-product
- INV rollback real: all-reserves
- INV rollback real: after-movement
- INV rollback real: after-order
- INV rollback real: completion
- INV transient write conflict reexecuta callback com ID estável e um único ledger
- INV commit confirmado com resposta desconhecida é resolvido pelo driver sem reservar novamente
- INV same-key 10 concorrentes/replays reserva uma vez e não expõe hashes/ledger
- INV corrida mesma key: recusa de catálogo após commit recupera Order em vez de encerrar tentativa
- INV inventory mass assignment, dinheiro e shipping continuam autoritativos
- INV shipping não reduz estoque e DELETE RESERVED preserva tudo
- INV legado sem inventário permanece legível e mantém fluxo de envio atual
- INV admin rejeita Stock true antes do casting
- INV admin rejeita Stock "10" antes do casting
- INV admin rejeita Stock 1.5 antes do casting
- INV admin rejeita Stock -1 antes do casting
- INV admin rejeita Stock null antes do casting
- INV admin rejeita Stock 9007199254740992 antes do casting
- INV admin aceita Stock 0
- INV admin aceita Stock 1
- INV admin aceita Stock 10
- INV checkout recusa Stock legado inválido -1
- INV checkout recusa Stock legado inválido 1.5
- INV checkout recusa Stock legado inválido 9007199254740992
- INV checkout recusa Stock legado inválido 10
- INV checkout recusa Stock legado inválido true
- INV checkout inválido/auth/CSRF não criam claim nem reserva
- INV duas APIs em processos diferentes disputam última unidade
- INV crash de processo após writes não persiste Order/movement/Stock
- E2E estoque: carrinho desatualizado, erro 409, carrinho preservado, tentativa terminal encerrada e próximo submit explícito com nova key.

Testes F005 atualizados para reserva única/stock -qty e callback transacional
entre conexões; fixture de reconciliação legado preservada. Antigo teste de
completion pós-Order foi substituído pela fixture legado, enquanto falha nova
de completion exige rollback integral. Erro owner operacional agora mantém
PROCESSING em vez de FAILED, tornando ambiguidade fail-closed. Testes de
DELETE, envio e erros de estoque acompanham contratos 409/reserva. E2E de
resposta perdida também comprova Stock reduzido exatamente uma vez.

## Testes focados

node ecommerce/tests/runWithReplicaSet.js --test tests/inventoryTransaction.test.js tests/inventoryAudit.test.js

**51/51**, zero fails/skips, 24,517 s, exit 0. Execuções individuais anteriores:
inventário 34/34 antes de adicionar unknown commit e audit 14/14 antes da CLI
real; os casos adicionais estão nos 51/51 finais.

## API completa

npm.cmd test --prefix ecommerce

**596/596**, zero fails/skips, 81,397 s, exit 0. Todos os caminhos de checkout
usam transações reais, sem bypass. Runner limita quatro arquivos simultâneos;
concorrência dentro de cada cenário permanece real. Primeira migração da suíte
para replica set teve expectativas antigas 400/DELETE e uma falha transitória
do AS-35 sob concorrência irrestrita. Contratos ajustados e execução
com concorrência limitada passou, sem enfraquecer políticas de produção.

## Build

npm.cmd run build --prefix ecommerce/frontend

**APROVADO**, 776 ms, exit 0. Npm update-notifier foi desativado nas execuções
finais porque notificações em stderr eram reportadas pelo PowerShell como erro
apesar de o build ter concluído; nenhuma dependência foi atualizada.

## E2E

npm.cmd run test:e2e --prefix ecommerce

**28/28**, 2,4 min, exit 0. Primeiro novo teste teve selector ambíguo entre três
alerts; corrigido filtrando texto comercial. Full rerun aprovado. CSP/CSRF,
dark mode, endereços, admin, dinheiro, perda de resposta e estoque preservados.

## git diff --check

**APROVADO.** git -c core.safecrlf=false diff --check, sem erros de whitespace.

## npm audit

Executado: **NÃO**. Nenhuma dependência/lockfile mudou, somente package scripts.
Não executado npm audit fix.

## Probe Stock=1

Duas requests concorrentes, keys distintas: 201=1, 409=1, Orders=1,
Movements=1, Stock final=0. Índices reais e writes condicionais, sem mutex local.

## Probe 10 concorrentes

Stock inicial=5, dez keys: sucessos=5, falhas de estoque=5, Orders=5,
RESERVE=5, Stock final=0. Qty 3/3 com Stock 5: uma venda, final 2.

## Probe multi-product rollback

Produto B se torna indisponível depois da preparação e aquisição da claim:
A intacto, B indisponível, nenhum Order/movement. Falhas após writes de A/B
revertem integralmente. Ordem A+B versus B+A disputa sem reserva parcial.

## Probe multi-process

API no pai + API filha em processos distintos, mesmo replica set temporário,
Stock=1, keys diferentes: [201,409], um Order/RESERVE, Stock=0.

## Probe idempotency replay

Order count=1, Movement count=1, Stock antes dos replays=9, depois=9.
Dez replays mesma key; também F005 cobre instâncias independentes/restart,
mesmo Order, sem nova reserva. Perda de resposta pós-commit + reload E2E
recupera pedido e confirma única redução de Stock.

## Probe topology

Standalone real temporário: listener NÃO; prepare NÃO; erro seguro.
Replica set real: detector aprova, transações reais commitam/abortam.

## Probe audit

Fixtures inválidas detectam todas as categorias descritas, Stock
negativo/fracionado/inseguro, Order sem movement e movement órfão. Snapshots de
todas as collections antes/depois idênticos; CLI real 0, READ_ONLY. Output
sem sentinelas PII/hash. Writes da auditoria: **ZERO**.

## Banco utilizado

Somente bases temporárias fetech_routes_*, fetech_routes_auth_*,
fetech_inventory_audit_*, fetech_e2e_*, fetech_money_* e
fetech_shipping_audit_* em Mongo isolado. Nenhum config.env sobrescrito.
**BANCO REAL NÃO AUDITADO NEM ALTERADO.** Nenhum rs.initiate/replSetInitiate
executado no Mongo local/comercial existente, nenhuma migration histórica.

## F005

**CONTINUA CORRIGIDO.** 39 testes backend e 9 helper frontend incluídos na suíte,
E2E de replay/reload/erro, índices reais e raw key/PII ausentes do claim.

## F006

**CONTINUA CORRIGIDO.** Testes permanentes JWT revogável/replay 401 aprovados.

## F007

**CONTINUA CORRIGIDO.** Cookie de produção seguro preservado.

## F008

**CONTINUA CORRIGIDO.** Rate limiting distribuído e concorrência aprovados.

## F009

**CONTINUA CORRIGIDO.** Recuperação uniforme preservada.

## F010

**CONTINUA CORRIGIDO.** Admin safety, último admin e conexões independentes aprovados.

## F012

**CONTINUA CORRIGIDO.** Shipping v2 completo, snapshot/zeros preservados.

## F013

**CONTINUA CORRIGIDO.** Quantity estrita/validação antes de writes preservadas.

## F014

**CONTINUA CORRIGIDO.** Preços autoritativos em centavos, sem controle do cliente.

## F020

**CONTINUA CORRIGIDO NO CÓDIGO.** Helmet/CSP/CSRF/Origin e logout POST.

## F021

**CONTINUA CORRIGIDO.** JWT fora JSON, no-store e dados internos ocultos.

## F036

**CONTINUA CORRIGIDO.** Config fail-fast antes de conexão, topology após conexão
e antes de listen; scripts operacionais usam perfil mínimo.

## Findings ainda abertos

F001 pagamento; F002 envio sem pagamento confirmado; F011 exclusão física/
histórico legado; F023 infraestrutura/deployment; F024 backup/restore;
F027 frete; F028 cancelamento/retorno/refund; F037 demais coerências Product.
Demais achados não foram declarados corrigidos nesta task.

## Documentação atualizada

ESTOQUE_TRANSACIONAL.md, relatório presente, README, COMANDOS, ROTAS,
CONFIGURACAO, ESTADO_ATUAL_PROJETO_FETECH, IDEMPOTENCIA_PEDIDOS,
VALIDACAO_CHECKOUT e PLANO_MELHORIAS_FETECH.

## Auditoria histórica

**NÃO ALTERADA.** Relatório original e relatórios anteriores preservados.

## Alterações fora de escopo

**NENHUMA.** Ajustes de harness/runner/suítes existentes são necessários para
testar a mesma semântica comercial transacional; guarda DELETE RESERVED é
mínima. Nenhum payment/webhook/refund/release/cron/TTL/commit comercial novo.

## Impacto de compatibilidade

Standalone deixa de atender o servidor comercial. Guia documenta replica set
local dedicado, com porta/dbpath distintos; banco existente não foi convertido.
Stock representa disponibilidade e novos Orders recebem inventário. Estoque
insuficiente passa de 400 para 409 com código; frontend conserva carrinho.
DELETE RESERVED é recusado. Legados permanecem compatíveis sem migrations.

## Riscos residuais

- Reservas Pending sem RELEASE/COMMIT comercial continuam consumindo disponibilidade.
- Pagamento real ausente, envio ainda não condicionado ao pagamento.
- Cancelamento/refund/retorno ausentes.
- DELETE histórico/lifecycle completo depende de F011.
- Products legados com Stock inválido exigem revisão explícita.
- Exclusão de Product/ajustes de catálogo ainda precisam política de lifecycle.
- Ledger cobre reservas novas; não reconstrói inventário histórico/ajustes anteriores.
- Backup/restore e deployment transacional produtivo ainda precisam ser validados.
- Reconciliação operacional de PROCESSING será ampliada com payment/post-sale.
- Transações falham fechado; crash anterior ao commit pode deixar claim PROCESSING.
- Legados conservam a compensação de envio anterior; essa task não migra histórico.

## Status da remediação

F003 / FET-P0-003: **CORRIGIDO** para novos pedidos.
F004 / FET-P0-004: **CORRIGIDO** no protocolo novo: nenhum caminho HTTP de
criação comercial altera Stock fora da transaction. Fluxo legado descrito
explicitamente, sem declarar atomicidade retroativa.

## Próxima task recomendada

F011 / FET-P0-009 — eliminar exclusão física de pedidos comerciais e preservar
histórico com lifecycle administrativo não destrutivo. **Não iniciada.**
