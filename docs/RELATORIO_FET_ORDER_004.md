# Relatório FET-ORDER-004 — máquina de estados comercial

08/10/2026. Evidência e entrega F002 / FET-P0-002.

## Resultado

CONCLUÍDO. Novos pedidos persistem PENDING, envio/entrega exigem confirmação, e o fluxo não inventa pagamento produtivo. F002 / FET-P0-002 corrigido.

## Branch

main.

## HEAD inicial

3534a882da1a467f81bad32b7485c7e52ad3853d.

## HEAD final

3534a882da1a467f81bad32b7485c7e52ad3853d. Nenhum commit solicitado nesta tarefa.

## Estado do worktree

Inicial limpo; F011 / FET-ORDER-003 já commitada em3534a88. O anexo estava desatualizado quanto ao commit. Nenhuma alteração anterior descartada; alterações desta tarefa permanecem sem commit. Nenhum reset/clean/push/config.env modificado.

## Finding tratado

F002 / FET-P0-002 — envio sem confirmação confiável de pagamento.

## Finding reproduzido antes da correção

Probe em replica set temporário, antes da primeira edição produtiva: novo pedido com paymentInfo.status Pending, paymentStatus MISSING, orderStatus Processing. PUT /admin/order/:id com status Shipped: HTTP200, estado final Shipped. Stock19→19 (reserva já realizada). Comando `node ecommerce/tests/runWithReplicaSet.js ../.local/order-state-before.cjs`, exit0, log local ignorado `.local/order-state-before.log`. Nenhum banco comercial utilizado.

## Causa raiz

Controller verificava apenas a sequência Processing→Shipped→Delivered; não existia confirmação autoritativa. paidAt existia, mas não era exigido. A UI oferecia envio/entrega independentemente do pagamento e mostrava status legado de paymentInfo.

## Estratégia implementada

paymentStatus sem default; PENDING explicitamente na criação transacional. paidAt válido junto de PAID define confirmação. Serviço pequeno de máquina de estados faz validação e CAS contra estado/pagamento/timestamp originalmente observados. DTO público limita paymentInfo e preserva tipo BSON original de paidAt, evitando transformar string em confirmação por casting Mongoose. Frontend separa pagamento/comercial/archive; audit:orders estendido READ_ONLY. Nenhum produtor PAID criado fora de fixtures isoladas de teste.

## Payment status

Persistidos: PENDING e PAID. Legado ausente: UNVERIFIED somente no DTO. Desconhecido: UNVERIFIED. Novo Order: PENDING e paidAt ausente. PAID sem BSON Date válido: paymentConfirmed false, apresentação Não verificado, envio bloqueado; audit sinaliza inconsistência.

## Fonte confiável de PAID

Existe em production: **NÃO**. F001 continua aberta. Futura integração deverá verificar evento real autenticado, pedido/valor em centavos, idempotência financeira e reconciliação antes de persistir PAID/paidAt. Nenhum markOrderPaid produtivo, segredo manual, gateway fake ou webhook implementado.

## Contrato de criação

Cliente define paymentStatus: NÃO. Define paidAt: NÃO. paymentInfo do cliente autoriza shipping: NÃO. Campos extras são ignorados pela canonicalização; o servidor grava PENDING e paymentInfo interno Pending dentro da própria transação, sem segundo write pós-commit. Replay mantém pagamento atual e não aplica spoof.

## Máquina de estados

| From | To | Payment | Resultado |
| --- | --- | --- | --- |
| Processing | Processing | Qualquer | 200, sem escrita |
| Processing | Shipped | PAID + paidAt válido | 200; sem confirmação409 |
| Processing | Delivered | Qualquer | 409 transição inválida |
| Shipped | Shipped | Qualquer | 200, sem escrita |
| Shipped | Delivered | PAID + paidAt válido | 200; sem confirmação409 |
| Shipped | Processing | Qualquer | 409 transição inválida |
| Delivered | Delivered | Qualquer | 200, sem escrita |
| Delivered | Shipped | Qualquer | 409 transição inválida |
| Delivered | Processing | Qualquer | 409 transição inválida |

## Error codes

400 para target ausente/desconhecido/não string ou ID inválido; 401/403 para auth/admin/CSRF; 404 para inexistente com target válido. 409 ORDER_PAYMENT_NOT_CONFIRMED e ORDER_STATUS_TRANSITION_INVALID. Precedência: estrutura, existência, mesmo estado, sequência, pagamento. Processing→Delivered inválido inclusive PENDING. Erros seguros sem stack/JWT.

## Atomicidade da transição

findOneAndUpdate condicionado a _id, orderStatus esperado, paymentStatus PAID e paidAt exato de BSON type date. Grava somente orderStatus e deliveredAt na entrega; nenhum save comercial/stock-write. CAS zero recarrega e distingue404, mesmo target200, pagamento409 ou estado409. Não reexecuta transição contra novo estado. Dez requests ao mesmo target são idempotentes; corrida com barreira demonstra que Delivered originalmente observado em Processing não aproveita Shipped concorrente. Requisição que observa Shipped após o envio pode solicitar Delivered legitimamente.

## Frontend admin

Badge separado Pendente/Pago/Não verificado, usando confirmação calculada pelo servidor. Botão de envio/entrega desabilitado sem confirmação e mensagem “O envio ficará disponível após a confirmação do pagamento.” Ordem/archive continuam dimensões distintas. Botão mark-paid: NÃO EXISTE. Cliente também vê pagamento em Meus pedidos e Detalhes.

## Legacy orders

Missing payment: UNVERIFIED/fail-closed, sem inferir de paymentInfo/paidAt/estado comercial. Shipped/Delivered históricos permanecem legíveis/intactos; same-state200 sem escrita. Auto-migration: NÃO. paidAt armazenado como string não vira confirmação no detalhe, listagem, archive ou replay, mesmo se seria convertível por Mongoose; consultas usam lean e apresentação preserva o valor original de pagamento, mantendo casting legado dos outros campos.

## Stock integration

Shipping altera Stock: NÃO. Cria movement: NÃO. Inventory status muda: NÃO. Preserva snapshot, centavos, paymentInfo persistido e OrderIdempotency. Removido decremento legado do controller; nenhuma reconstrução de baseline histórico. Reserva continua RESERVED; commit/release futuros F001/F028.

## F005 integration

Replay após Shipped/Delivered retorna mesmo ID e estado atual, sem nova reserva ou alteração de claim/pagamento. Leitura da ordem idempotente preserva BSON original para DTO financeiro seguro. Teste entre conexões/restart usa _id persistido, sem depender do virtual id de documento hidratado.

## F011 integration

Archive interfere na sequência/pagamento: NÃO. Pending arquivado continua bloqueado; PAID confirmado arquivado pode avançar. Metadata não alterada por status. DELETE405 e guardas físicas continuam protegidos. Teste anterior de envio arquivado agora usa PAID somente por fixture.

## Audit

Script existente audit:orders, backend/scripts/auditOrders.js, utils/orderHistoryAudit.js. Modo READ_ONLY, perfil orders-audit existente, nenhuma nova ferramenta/flag de apply. Categorias adicionadas: LEGACY_PAYMENT_UNVERIFIED, UNKNOWN_PAYMENT_STATUS, SHIPPED_WITHOUT_CONFIRMED_PAYMENT, DELIVERED_WITHOUT_CONFIRMED_PAYMENT, PAID_WITHOUT_PAID_AT, PAID_AT_WITHOUT_PAID_STATUS. Mantém categorias F011/claims/movimentos. Categorias + ObjectIds, sem valores arbitrários de pagamento ou PII. Banco real: NÃO. Snapshot de documentos antes/depois idêntico e teste com apenas find disponível provam ausência de writes; CLI pré-existente continua testada.

## Arquivos criados

- ecommerce/backend/services/orderStateMachine.js
- ecommerce/backend/utils/orderPayment.js
- ecommerce/tests/helpers/orderPaymentFixture.js
- ecommerce/tests/orderStateMachine.test.js
- ecommerce/tests/orderPaymentAudit.test.js
- ecommerce/tests/e2e/orderStateMachine.spec.js
- docs/ESTADOS_PEDIDO_PAGAMENTO.md
- docs/RELATORIO_FET_ORDER_004.md

## Arquivos alterados

Order model/controller, orderInventoryService, orderIdempotencyService, orderHistoryService, money DTO, orderHistoryAudit; Dashboard, OrderDetails, Orders e format; testes api/checkoutValidation/inventoryTransaction/orderHistory/orderIdempotency e E2E routes/server; README, ROTAS, ESTADO_ATUAL, PLANO_MELHORIAS, HISTORICO_PEDIDOS, ESTOQUE_TRANSACIONAL e IDEMPOTENCIA_PEDIDOS.

## Dependências adicionadas

NENHUMA. Package manifests e lockfiles inalterados.

## Testes adicionados

Lista individual de casos executados ao final deste relatório. Cenário novo E2E: cliente vê Pendente, admin vê detalhe/painel, botão bloqueado, spoof direto409, archive independente e sem botão de confirmação. Cenário Dashboard ampliado: PAID apenas por fixture DB temporária, salto Delivered409, Shipped→Delivered legítimos e archive/unarchive/DELETE405 mantidos. Regressões anteriores adaptadas ao novo contrato com PAID fixture, preservando verificações originais de estoque/snapshot/replay e somando bloqueios PENDING.

## Testes focados

`node ecommerce/tests/runWithReplicaSet.js --test tests/orderStateMachine.test.js tests/orderPaymentAudit.test.js`: **65/65**, zero falhas, exit0. Log `.local/order-state-focus.log`. Inclui pagamentos inconsistentes em GET/lista/archive/replay, validação, concorrência/CAS, privacidade, legados, rollback e arquitetura sem confirmação produtiva.

## API completa

`npm.cmd test --prefix ecommerce`: **675/675**, zero falhas, exit0, 111,03 s. Log `.local/order-state-api.log`. A primeira suíte após implementação passou674/674; a revisão adicional de casting acrescentou um teste e motivou nova suíte integral. Regressão entre conexões detectou uso do virtual .id em uma asserção; ajustada para _id persistido, sem relaxar unicidade/restart. A suíte isolada de idempotência também passou39/39.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: aprovado, exit0, 1,25 s. Frontend não alterado após o build. Log `.local/order-state-build.log`.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: **30/30**, zero falhas, exit0, 3,0 min. Log `.local/order-state-e2e.log`. Primeiro resultado29/30: todos os novos fluxos passaram; cadastro no cenário shipping recebeu429 porque novo cenário havia consumido quota compartilhada. Novo cenário usa login de usuário preseeded exclusivamente no servidor de teste; política de rate limit produtiva preservada. Suíte integral reexecutada com sucesso.

## git diff --check

`git -c core.safecrlf=false diff --check`: aprovado, exit0; repetido após relatório. Avisos LF/CRLF não representam falhas.

## npm audit

Executado: NÃO. Nenhum package/dependência/lockfile alterado; task dispensa audit nesse caso. Não executado audit fix e nenhuma vulnerabilidade de dependência declarada resolvida.

## Probe PENDING -> Shipped

409 ORDER_PAYMENT_NOT_CONFIRMED; orderStatus Processing. Comparação integral de Order/Product.Stock/StockMovement/OrderIdempotency idêntica, incluindo spoof de payment, inventory e archive. Criados no replica set temporário.

## Probe PAID -> Shipped

PAID definido por TEST FIXTURE; BSON Date em paidAt. HTTP200, final Shipped. Stock, movements, inventoryStatus, cents, snapshot, payment e claims preservados. Não existe rota para reproduzir confirmação no ambiente comercial.

## Probe direct Delivered

Processing pago ou pendente→Delivered:409 ORDER_STATUS_TRANSITION_INVALID. Sem alteração de documentos. Corrida controlada contra Shipped confirma ausência de retry que habilitaria o salto.

## Probe legitimate Delivered

Fixture PAID: Processing→Shipped→Delivered, HTTP200/200; deliveredAt válido; repetir Delivered200 sem escrita. UI oferece apenas o próximo estado, sem salto.

## Probe spoof

paymentStatus/paidAt alterados pelo cliente: NÃO. Shipping ocorreu em PENDING com spoof: NÃO,409. paymentInfo arbitrário não autoriza. Status endpoint consome somente status e não escreve payment/inventory/archive.

## Probe legacy

Sem paymentStatus: UNVERIFIED no DTO e envio409; Shipped/Delivered permanecem legíveis e same-state200/no-op. PaidAt string, PAID sem paidAt, paidAt sem PAID e unknown também bloqueados. Nenhuma migração/repair automático.

## Probe audit

Onze combinações financeiras e um teste de interface exclusivamente find: categorias esperadas, nenhum write, zero PII; mantém auditoria anterior e CLI somente leitura. Histórico enviado sem confirmação detectado, não corrigido automaticamente.

## Banco utilizado

MongoDB real em replica set temporário do runner, portas dinâmicas/dbpath .local/test-mongo-rs-*. Bancos únicos fetech_routes_auth_*, fetech_payment_audit_* e fetech_e2e_*. Helpers de PAID verificam URI/nome/hosts/replica set e só existem em tests; nenhum import no backend/frontend. Teardown conserva instância local27017 e limpa apenas bancos/processos próprios.

**BANCO REAL NÃO ALTERADO.** config.env/secrets preservados; audit não executado no banco comercial.

## F003

CONTINUA CORRIGIDO.

## F004

CONTINUA CORRIGIDO. Fault injection completo após reserva/Order e teste novo de rollback mantêm ausência de pedido parcial PENDING.

## F005

CONTINUA CORRIGIDO.

## F011

CONTINUA CORRIGIDO.

## F006

CONTINUA CORRIGIDO.

## F007

CONTINUA CORRIGIDO.

## F008

CONTINUA CORRIGIDO. Limiter produtivo mantido; quota atingida pelo E2E não foi contornada no runtime.

## F009

CONTINUA CORRIGIDO.

## F010

CONTINUA CORRIGIDO.

## F012

CONTINUA CORRIGIDO.

## F013

CONTINUA CORRIGIDO.

## F014

CONTINUA CORRIGIDO.

## F020

CONTINUA CORRIGIDO.

## F021

CONTINUA CORRIGIDO. No-store, JWT fora do JSON e metadata de archive privada ao cliente mantidos.

## F036

CONTINUA CORRIGIDO.

## Findings ainda abertos

F001 pagamento real; F022 paginação/escala; F023 deployment/TLS; F024 backup/restore; F025 observabilidade/audit trail; F027 frete; F028 cancelamento/devolução/refund/release; F029 integrações reais; F030 privacy/retention. Não fechados por esta task.

## Documentação atualizada

ESTADOS_PEDIDO_PAGAMENTO.md e este relatório criados. README, ROTAS, HISTORICO_PEDIDOS, ESTOQUE_TRANSACIONAL, IDEMPOTENCIA_PEDIDOS, ESTADO_ATUAL e PLANO atualizados com contrato, dimensões, transições, boundary F001 e riscos. Entradas históricas do plano mantidas; seção datada informa estado vigente.

## Auditoria histórica

NÃO ALTERADA. Relatório original e relatórios anteriores preservados.

## Alterações fora de escopo

NENHUMA. Fixtures, usuário E2E preseeded e serialização financeira necessários para validar/remediar F002 sem fake produtivo. Nenhum gateway, webhook, Payment model, cancelamento, refund, TTL ou mudança no banco real.

## Impacto de compatibilidade

Novo Order PENDING. Shipping antes permitido agora409 sem confirmação. Same-state antes400 passa200. Legado missingpayment UNVERIFIED. UI administrativa atualizada; nenhum caminho produtivo para confirmar pagamento. paymentInfo público reduzido a status derivado, sem ID/token/estrutura arbitrária; pagamento persistido não alterado. Campos administrativos e hashes continuam protegidos.

## Riscos residuais

Novos pedidos não podem ser expedidos até F001. Reservas Pending continuam consumindo estoque; cancel/release/expiração automática não existem. Históricos enviados sem confirmação exigem auditoria/revisão com backup validado. Refund/devolução/gateway/webhook ainda não existem. Acesso MongoDB privilegiado permanece fora do boundary HTTP. Paginação/audit trail completos são tarefas separadas.

## Status da remediação

F002 / FET-P0-002: **CORRIGIDO**. API675/675, focados65/65, E2E30/30, build e diff check aprovados. F001 e demais findings permanecem nos escopos próprios.

## Próxima task recomendada

F001 / FET-P0-001 — pagamento real com gateway, confirmação confiável via webhook, reconciliação, idempotência financeira e transição segura PENDING→PAID. Não iniciada automaticamente.


## Casos focados executados individualmente

1. PAYMENT AUDIT Processing {} READ_ONLY e sem PII
2. PAYMENT AUDIT Shipped {} READ_ONLY e sem PII
3. PAYMENT AUDIT Delivered {} READ_ONLY e sem PII
4. PAYMENT AUDIT Shipped {"paymentStatus":"PENDING"} READ_ONLY e sem PII
5. PAYMENT AUDIT Delivered {"paymentStatus":"PENDING"} READ_ONLY e sem PII
6. PAYMENT AUDIT Processing {"paymentStatus":"PAID"} READ_ONLY e sem PII
7. PAYMENT AUDIT Shipped {"paymentStatus":"PAID","paidAt":"2026-10-08T00:00:00Z"} READ_ONLY e sem PII
8. PAYMENT AUDIT Processing {"paymentStatus":"PENDING","paidAt":"2026-10-08T18:08:03.385Z"} READ_ONLY e sem PII
9. PAYMENT AUDIT Processing {"paymentStatus":"PRIVATE_UNKNOWN"} READ_ONLY e sem PII
10. PAYMENT AUDIT Processing {"paymentStatus":"PENDING"} READ_ONLY e sem PII
11. PAYMENT AUDIT Delivered {"paymentStatus":"PAID","paidAt":"2026-10-08T18:08:03.385Z"} READ_ONLY e sem PII
12. PAYMENT AUDIT só precisa de find, nenhuma API de escrita disponível
13. STATE criação PENDING ignora sem spoof
14. STATE criação PENDING ignora paymentStatus
15. STATE criação PENDING ignora paidAt
16. STATE criação PENDING ignora paymentInfo
17. STATE PENDING não avança com spoof sem spoof
18. STATE PENDING não avança com spoof paymentStatus
19. STATE PENDING não avança com spoof paidAt
20. STATE PENDING não avança com spoof paymentInfo
21. STATE PENDING não avança com spoof inventoryStatus,Stock,administrativeArchivedAt,administrativeArchivedBy
22. STATE Processing->Processing, paid=false
23. STATE Processing->Shipped, paid=false
24. STATE Processing->Delivered, paid=false
25. STATE Shipped->Shipped, paid=false
26. STATE Shipped->Delivered, paid=false
27. STATE Shipped->Processing, paid=false
28. STATE Delivered->Delivered, paid=false
29. STATE Delivered->Shipped, paid=false
30. STATE Delivered->Processing, paid=false
31. STATE Processing->Processing, paid=true
32. STATE Processing->Shipped, paid=true
33. STATE Processing->Delivered, paid=true
34. STATE Shipped->Shipped, paid=true
35. STATE Shipped->Delivered, paid=true
36. STATE Shipped->Processing, paid=true
37. STATE Delivered->Delivered, paid=true
38. STATE Delivered->Shipped, paid=true
39. STATE Delivered->Processing, paid=true
40. STATE target inválido undefined
41. STATE target inválido null
42. STATE target inválido true
43. STATE target inválido 42
44. STATE target inválido []
45. STATE target inválido {}
46. STATE target inválido "Banana"
47. STATE target inválido "Cancelled"
48. STATE pagamento inconsistente/legado {"paymentStatus":"PAID"}
49. STATE pagamento inconsistente/legado {"paymentStatus":"PENDING","paidAt":"2026-10-08T18:08:05.373Z"}
50. STATE pagamento inconsistente/legado {"paymentStatus":"PAID","paidAt":"2026-10-08T00:00:00Z"}
51. STATE pagamento inconsistente/legado {"paymentStatus":"BAD","paidAt":"2026-10-08T18:08:05.373Z"}
52. STATE pagamento inconsistente/legado {}
53. STATE timestamp textual não vira confirmação no replay ou histórico do cliente
54. STATE permissões, CSRF, Origin, ID e inexistente
55. STATE archive independente, replay e dados sensíveis privados
56. STATE legacy Processing é UNVERIFIED sem escrita nem inferência de paymentInfo
57. STATE legacy Shipped é UNVERIFIED sem escrita nem inferência de paymentInfo
58. STATE legacy Delivered é UNVERIFIED sem escrita nem inferência de paymentInfo
59. STATE dez transições concorrentes ao mesmo target são idempotentes
60. STATE corrida de skip inválido usa estado originalmente observado sem retry
61. STATE CAS zero mapeia concorrência payment
62. STATE CAS zero mapeia concorrência status
63. STATE CAS zero mapeia concorrência missing
64. STATE rollback transacional não deixa Order PENDING parcial
65. STATE arquitetura sem confirmação produtiva, helpers ou escrita de estoque na transição
