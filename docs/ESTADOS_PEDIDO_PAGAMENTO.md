# Estados do pedido e pagamento

FET-ORDER-004 / F002 / FET-P0-002 — 08/10/2026.

**Até F001, nenhum endpoint da aplicação confirma pagamento. Novos pedidos permanecem bloqueados para expedição.** Não existe botão administrativo, rota pública/administrativa, segredo manual, webhook ou gateway simulado que marque um pedido como pago. PAID em testes é apenas fixture escrita diretamente no replica set temporário.

## Dimensões distintas

| Dimensão | Valores atuais | Significado |
| --- | --- | --- |
| Order | Processing / Shipped / Delivered | Andamento comercial |
| Payment | PENDING / PAID; UNVERIFIED derivado para legado | Confirmação financeira |
| Inventory | RESERVED para novos pedidos | Reserva transacional já realizada |
| Administrative | Active / Archived | Organização administrativa, sem efeito financeiro |

`paymentStatus` é persistido sem default. O fluxo transacional de criação grava explicitamente PENDING junto com Order, Stock, StockMovement e conclusão de idempotência. `paidAt` já existia; novos pedidos mantêm o campo ausente. PAID só autoriza avanço acompanhado de BSON Date válido em paidAt. Não inferimos confirmação de paymentInfo.status, paidAt sozinho, Shipped ou Delivered.

Legados sem campo recebem `paymentStatus: UNVERIFIED` somente no DTO, sem migração/escrita. Estado desconhecido também é apresentado como UNVERIFIED. PAID inconsistente permanece identificável no campo técnico, mas `paymentConfirmed: false` impede envio e a UI mostra “Não verificado”. Não alteramos status históricos Shipped/Delivered automaticamente.

`paymentConfirmed` é calculado no servidor. A apresentação de paymentInfo limita-se a `{ status: 'Pending' | 'Paid' | 'Unverified' }`, derivado da informação autoritativa; IDs internos, tokens, cartões e estruturas arbitrárias não são enviados. Dados persistidos de pagamento permanecem intactos. paidAt e paymentStatus enviados pelo cliente/admin não criam autoridade.

## Máquina de estados

| De | Para | Pagamento exigido | Permitido |
| --- | --- | --- | --- |
| Processing | Processing | Não | Sim, sem escrita |
| Processing | Shipped | PAID e paidAt válido | Sim |
| Processing | Delivered | — | Não |
| Shipped | Shipped | Não | Sim, sem escrita |
| Shipped | Delivered | PAID e paidAt válido | Sim |
| Shipped | Processing | — | Não |
| Delivered | Delivered | Não | Sim, sem escrita |
| Delivered | Shipped | — | Não |
| Delivered | Processing | — | Não |

Mesmo estado é idempotente inclusive em legado ou PENDING; não representa avanço. Delivered é terminal nesta máquina. Cancelamento/devolução/refund permanecem F028.

## Contrato HTTP

PUT `/api/v1/admin/order/:id`, corpo `{ "status": "Shipped" }` ou outro valor do enum. Admin autenticado e CSRF/Origin continuam obrigatórios; somente status é consumido. Campos extras são ignorados, inclusive paymentStatus, paidAt, paymentInfo, inventoryStatus, Stock e metadata de archive. Spoof em pedido PENDING não confirma pagamento e retorna o mesmo 409 do avanço bloqueado.

- 200: transição legítima ou mesmo estado sem escrita.
- 400: status ausente, não string, desconhecido ou ID inválido.
- 401/403: autenticação/autorização/CSRF existentes.
- 404: pedido inexistente com target válido.
- 409 `ORDER_STATUS_TRANSITION_INVALID`: salto, retrocesso ou conflito de estado concorrente.
- 409 `ORDER_PAYMENT_NOT_CONFIRMED`: avanço permitido pela sequência, mas pagamento não confirmado/inconsistente.

A precedência é: validação estrutural → existência → mesmo estado → sequência → pagamento. Portanto Processing→Delivered retorna transição inválida, mesmo PENDING.

## Atomicidade e concorrência

O serviço orderStateMachine lê o estado e valida a intenção uma vez. Executa findOneAndUpdate condicionado a `_id`, orderStatus originalmente observado, paymentStatus PAID e paidAt exato de tipo BSON date. Somente orderStatus e, em Delivered, deliveredAt são gravados. Não usa read/check/save como garantia, não decrementa estoque nem chama serviço de pagamento/inventário.

CAS sem correspondência recarrega para distinguir inexistente404, target já atingido200, pagamento409 e conflito de estado409. Não reexecuta transição contra outro estado. Uma intenção Processing→Delivered observada antes de outra requisição enviar o pedido permanece inválida. Uma requisição que começa após o pedido já estar Shipped pode legitimamente solicitar Delivered; não há inferência do instante do clique por requisições independentes.

Dez requests simultâneos ao mesmo target são idempotentes. Uma corrida controlada prova que requests que observaram Processing não permitem pular para Delivered. paidAt/paymentStatus são rechecados no write. Archive pode mudar concorrentemente sem perder metadata, pois o update não escreve seus campos.

## Estoque, replay e histórico

Envio/entrega não alteram Product.Stock, StockMovement, inventoryStatus, shippingInfo, centavos, pagamento ou OrderIdempotency. A antiga redução adicional para legado foi removida; dados históricos de estoque não são reconstruídos. Reserva continua RESERVED; commit/release futuros pertencem a F001/F028.

Replay retorna o mesmo Order com o estado comercial e pagamento atuais, sem reserva adicional. DELETE continua405 e archive/unarchive continua independente: PENDING arquivado bloqueado; PAID confirmado arquivado pode avançar.

Cliente vê pagamento em Meus pedidos e Detalhes. Dashboard exibe status do pedido, pagamento e Arquivado separadamente. Os botões de envio/entrega são desabilitados sem confirmação, com mensagem explicativa. Manipular o DOM não altera a regra da API. Não há botão para marcar pago.

## Auditoria

O comando existente `npm.cmd run audit:orders --prefix ecommerce` foi estendido, mantendo READ_ONLY, perfil mínimo orders-audit, sem argumentos de escrita ou criação de índices/collections. Nesta tarefa somente fixtures temporárias foram auditadas.

Categorias financeiras: LEGACY_PAYMENT_UNVERIFIED; UNKNOWN_PAYMENT_STATUS; PAID_WITHOUT_PAID_AT (inclui timestamp de tipo inválido); PAID_AT_WITHOUT_PAID_STATUS; SHIPPED_WITHOUT_CONFIRMED_PAYMENT; DELIVERED_WITHOUT_CONFIRMED_PAYMENT. Uma linha pode gerar várias categorias. Mantém também as verificações anteriores de archive, claims, movimentos e reserva. Saída somente resumo, categoria e ObjectId; não imprime nome, endereço, CEP, telefone, email, token, cartão, paymentInfo ou hashes.

Auditoria não marca pago, rebaixa status, libera estoque ou corrige histórico. Antes de futura revisão manual, backup/restore F024 precisa estar validado.

## Boundary futuro F001 e riscos

F001 deverá autenticar/verificar eventos reais do gateway, conferir pedido/valor em centavos, aplicar idempotência financeira e reconciliação e então persistir PAID com paidAt confiável. Esse produtor não existe hoje e não foi criado nesta tarefa.

Pedidos novos continuam reservando Stock e não podem ser expedidos até F001. Não há cancelamento/release/expiração automática/refund. Históricos enviados sem confirmação exigem auditoria e revisão própria; não são reescritos. F023/F024/F025/F027/F028/F029/F030 e paginação/escala F022 continuam pendentes.

## Verificação

```powershell
node ecommerce/tests/runWithReplicaSet.js --test tests/orderStateMachine.test.js tests/orderPaymentAudit.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
git -c core.safecrlf=false diff --check
```

Todos os testes usam bancos temporários em replica set real isolado. Helpers PAID existem apenas em tests, validam nome de banco e conexão do runner e não são importados pelo runtime/frontend. Nenhum banco comercial ou config.env foi alterado.
