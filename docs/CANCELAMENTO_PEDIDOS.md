# Cancelamento de pedidos — FET-ORDER-005 / F028

**F028: PARCIAL.** Cancelamento unpaid/pre-fulfillment com liberação de reserva
corrigido no código. Refund = `BLOCKED_BY_F001`; return/reverse logistics =
`BLOCKED_BY_F027_AND_BUSINESS_POLICY`; auto-expiração = `POLICY_UNDEFINED`.
Não existe operação financeira, devolução física ou desfazer cancelamento nesta entrega.

## Inventário factual anterior à implementação

Fontes: `backend/models/orderModel.js`, `orderInventoryService.js`,
`orderStateMachine.js`, `utils/orderPayment.js` e `orderHistoryService.js`.

| Campo real | Semântica anterior | Fonte de verdade |
|---|---|---|
| orderStatus | Processing, Shipped, Delivered; default Processing | Order persistido |
| paymentStatus | PENDING ou PAID, opcional para legado | Order persistido |
| paidAt | Evidência confiável somente BSON Date válido | Order bruto, sem casting de texto |
| paymentInfo | Estado legado/apresentação; não confirma pagamento | Não é autoridade financeira |
| deliveredAt | Data gravada na transição Delivered | State machine F002 |
| shippedAt | Campo NÃO existente no model/fluxo anterior | Se encontrado em raw legacy, tratado como bloqueio |
| inventoryStatus | Somente RESERVED; opcional no legado | Transação de criação F003/F004 |
| inventoryVersion | 1, imutável | Contrato de reserva |
| inventoryReservedAt | Timestamp da reserva, imutável | Transação de criação |
| administrativeArchivedAt | Data ou null, select:false | Archive F011; não muda estado comercial |
| administrativeArchivedBy | Referência User ou null, select:false | Auditoria administrativa |
| archived/archivedAt | NÃO existem com esses nomes | DTO/admin usa campos acima |
| user | Referência ao dono do pedido | Order persistido |
| orderItems | Snapshot de produto, quantidade, preço e imagem | Criação transacional; quantidade conferida com RESERVE |
| createdAt | Timestamp de criação | Servidor |
| *PriceCents | Dinheiro inteiro F014 | Snapshot comercial, preservado no cancelamento |

Pagamento confirmado F002 exige **PAID E paidAt BSON Date válido** para avançar
fulfillment. Ausência/status desconhecido é apresentado como UNVERIFIED, sem
inferir pagamento de paymentInfo. Cancelamento é mais conservador: PAID sozinho,
paidAt válido sozinho ou evidência de envio/entrega já impedem este fluxo.
Timestamp de pagamento textual/malformado também bloqueia como não verificado.

## State machine F002 e extensão

| Atual | Destino | Permitido antes? | Preconditions |
|---|---|---|---|
| Processing | Processing | SIM, no-op | Sem mutação |
| Processing | Shipped | SIM | PAID + paidAt BSON Date válido |
| Shipped | Shipped | SIM, no-op | Sem mutação |
| Shipped | Delivered | SIM | PAID + paidAt BSON Date válido |
| Delivered | Delivered | SIM, no-op | Sem mutação |
| Processing | Delivered | NÃO | Salto proibido |
| Shipped/Delivered | Estado anterior | NÃO | Sem regressão |
| Processing | Cancelled | NÃO antes; agora somente endpoint cancel | Elegibilidade + ledger verificados na transação |
| Cancelled | Processing/Shipped/Delivered | NÃO | Terminal e irreversível |

Naming real escolhido: **Cancelled**, consistente com Processing/Shipped/Delivered;
UI exibe **Cancelado**. Não há endpoint uncancel nem conversão via PUT status.

## Estoque e ledger

Product.Stock é available-to-sell; criar pedido reduz Stock e grava RESERVE junto
com Order/idempotência/outbox. Sem timeout de reserva factual encontrado.

| Tipo | Antes? | Significado e delta |
|---|---|---|
| RESERVE | SIM | Reserva por Order/produto; stockAfter=stockBefore−quantity. Delta negativo é implícito; campo delta não era obrigatório |
| INITIAL_STOCK | SIM, F037 | Baseline explícito de novos produtos, delta positivo |
| ADMIN_ADJUSTMENT | SIM, F037 | Ajuste administrativo, delta com sinal |
| RELEASE | NOVO | Devolve reserva do Order cancelado ao disponível, delta=+quantity |

RELEASE preserva Order, Product, quantity, stockBefore, stockAfter, version=1,
actorUserId e reason=ORDER_CANCELLED. Não representa refund ou return.
Não reconstrói saldo de produtos históricos sem baseline F037.

Nenhum índice novo ou migration nova. CAS do Order e conflitos Mongo serializam
cancelamentos; testes incluem duas APIs em processos independentes. O índice
parcial RESERVE existente F037 permanece pré-requisito: se o índice antigo
`one_order_product_movement` ainda existir, a operação falha com o gate F037
PRODUCT_STOCK_LEDGER_INDEX_REQUIRED. Migração comercial segue pendente, não aplicada.

## Elegibilidade central e fail closed

`utils/orderCancellation.js` retorna `{canCancel, blockedReason}` a partir do
estado BSON atual; DTOs incluem `cancellation`. A lista é apenas indicação para UX.
`services/orderCancellationService.js` revalida dentro da transação e exige
um RESERVE coerente/versionado por item, quantidade igual ao snapshot, sem itens
duplicados, sem release prévio e com todos os produtos/estoques válidos.

| Condição | Resultado |
|---|---|
| Processing + PENDING sem paidAt + RESERVED/v1/timestamp válido + ledger íntegro | Elegível |
| PAID ou paidAt válido | 409 ORDER_REFUND_REQUIRED |
| Shipped/Delivered ou shippedAt/deliveredAt presente | 409 ORDER_RETURN_REQUIRED |
| Pagamento ausente/desconhecido/timestamp inválido | 409 ORDER_PAYMENT_UNVERIFIED |
| Reserva/versão/timestamp/ledger/produto/quantidade não verificáveis ou overflow | 409 ORDER_INVENTORY_UNVERIFIED |
| Estado comercial incompatível | 409 ORDER_NOT_CANCELLABLE |
| Cancelled + RELEASED + cancelledAt válido e sem evidências proibidas | Replay 200, zero writes |

Nenhuma suposição de que legado sem metadata reservou estoque. Nenhum repair,
auto-release ou migração automática. Admin segue os mesmos bloqueios comerciais.

## Rotas e autorização

`POST /api/v1/order/:id/cancel`: cliente autenticado, somente seu próprio pedido.
Pedido alheio ou inexistente retorna 404 sem revelar dados. Admin pela rota
cliente continua limitado ao próprio pedido.

`POST /api/v1/admin/order/:id/cancel`: exclusivamente admin, sem force cancel.
Body vazio; quantity/force/status/reason livre e outros campos são rejeitados com
400. IDs inválidos 400; visitante 401; role/CSRF/Origin inválidos 403; conflitos 409.
Respostas privadas preservam no-store, request ID e proteções F020/F021.
Não há limiter novo: mantidos os middlewares existentes.

## Fronteira transacional, replay e concorrência

Uma transação snapshot/majority contém: leitura atual e CAS do Order para
Cancelled/RELEASED, incremento condicionado de cada Product.Stock, RELEASE de
cada item, ORDER_CANCELLED na outbox e AdminAuditEvent quando a origem é admin.
Quantidade vem exclusivamente do snapshot persistido e é conferida com o ledger.
Nenhum SMTP ocorre na transação. Falha em qualquer produto, movement, outbox ou
audit desfaz tudo, inclusive pedidos com vários itens.

Mongo withTransaction reexecuta conflitos; cada tentativa limpa a coleção de
eventos de log pós-commit. Outbox usa ORDER_CANCELLED:OrderId:v1. Replay não
incrementa Stock nem cria movement/event/audit. Não utiliza Idempotency-Key nova
nem altera o contrato de criação F005: criação em replay continua retornando o
mesmo Order, inclusive depois de cancelado.

Stock usa `$inc` condicionado por inteiro seguro/limite; nunca save absoluto stale.
Conflitos com nova reserva, ajuste F037, mudança de fulfillment/pagamento e archive
revalidam o snapshot. Não usa mutex local. Archive e cancelamento são independentes;
pedido arquivado elegível pode ser cancelado e ambos os metadados sobrevivem.
Preço, shipping, reviews, agregados, categoria e valores do pedido não são alterados.

## UI e acessibilidade

Meus Pedidos, detalhe e Dashboard oferecem ação somente quando DTO indica
elegibilidade. Detalhe administrativo usa endpoint admin; a role do browser não
substitui autorização no servidor. Dialog possui título/descrição, focus trap,
Voltar com foco inicial, Escape/retorno de foco e confirmação clara irreversível.
Durante envio: Cancelando…, confirmação desabilitada e guard ref contra dois cliques.
Ao remover a ação após sucesso, foco pode retornar ao h1.
Conflito atual aparece em Alert acessível, sem promessa de reembolso/devolução.
Histórico preserva Cancelado e detalhe exibe cancelledAt.

Lista cliente protege resultado cancelado contra GET antigo por mapa em memória;
Dashboard invalida sequence de listagem antiga e detalhe aborta leitura anterior.
Não existe nova chave localStorage/sessionStorage nem persistência comercial nova.

## Auditoria administrativa, F030 e F040

Admin grava action ORDER_CANCELLED, targetId do Order e reasonCode ADMIN_REQUEST
na mesma transação. Sem shipping, email, telefone ou cópia do pedido. Auditoria
administrativa é exclusiva de admin; self-cancel não cria evento admin, tendo
Order + ledger + outbox como evidência comercial.

Campos novos: cancelledAt, cancelledByUserId, cancellationSource (CUSTOMER/ADMIN),
cancellationReasonCode (CUSTOMER_REQUEST/ADMIN_REQUEST). cancelledByUserId é
**PSEUDONYMOUS_IDENTIFIER**, não anônimo, registrado no privacy registry com
retenção UNDEFINED. Omitido dos DTOs; audit:users reconhece a referência opcional.
Admin pode cancelar reserva elegível de conta DEACTIVATED/ANONYMIZED. Cliente
desativado não autentica. Nenhuma conta é reativada pelo cancelamento.

Evento ORDER_CANCELLED tem dedupe persistente por Order/evento/versão, sem email
ou body na outbox. Worker resolve User atual; ANONYMIZED é SUPPRESSED. Template
pt-BR text/HTML informa que o pedido foi cancelado e não seguirá processamento.
Não afirma estorno, reembolso, valor devolvido ou logística reversa. Sem depender
de valor monetário para renderizar esse template. Worker mantém lease/retry e
semântica at-least-once/best-effort: não promete SMTP exactly-once.

## Auditoria somente leitura

Comando existente estendido: `npm.cmd run audit:orders --prefix ecommerce`.
CLI usa perfil orders-audit, autoCreate/autoIndex false e leitura snapshot, sem
--apply/repair. Executado nesta task somente em bancos temporários dos testes.
A API de helper preserva defaults antigos de auditoria; CLI habilita lifecycle.

Novas categorias: ORDER_CANCELLED_WITH_RESERVED_INVENTORY,
ORDER_CANCELLED_WITHOUT_CANCELLED_AT, ORDER_CANCELLED_WITH_SHIPPED_STATE,
ORDER_CANCELLED_WITH_DELIVERED_STATE, ORDER_CANCELLED_WITH_PAID_STATE,
ORDER_CANCELLED_WITH_UNVERIFIED_PAYMENT, ORDER_RELEASE_MOVEMENT_MISSING,
ORDER_RELEASE_MOVEMENT_DUPLICATED/INCOHERENT/UNEXPECTED,
ORDER_CANCEL_EVENT_MISSING/DUPLICATED, ORDER_RELEASE_WITHOUT_CANCELLATION e
ORDER_LEGACY_INVENTORY_UNVERIFIED. Output somente contagens/categorias/IDs técnicos,
sem PII. Zero providers, zero escrita ou auto-repair. audit:inventory reconhece
RELEASED/RELEASE e audit:products F037 entende o delta positivo.

## Pendências e limites

Pedidos unpaid não cancelados manualmente podem manter reserva indefinidamente.
**AUTO EXPIRATION POLICY = UNDEFINED.** Nenhum cron, prazo ou auto-cancelamento.
Nenhuma janela de devolução ou política de refund foi inventada.
Refund depende de F001; devolução/logística reversa depende de F027 e política.
F023/F024/F026/F029 permanecem pendentes; F032 parcial por F023; F039 remoto
pendente. Índices comerciais F022/F037 não aplicados e nenhum provider real chamado.
Não iniciar automaticamente F001/F027 ou outra task.

Evidências: [TESTES_FET_ORDER_005.md](TESTES_FET_ORDER_005.md).
Entrega e inventário de findings restantes: [RELATORIO_FET_ORDER_005.md](RELATORIO_FET_ORDER_005.md).
