# Relatório FET-ORDER-005 — Cancelamento seguro

Resultado: **CONCLUÍDO**, cancelamento + release transacional implementados e
validação integral aprovada em 17/10/2026. **Finding F028 permanece PARCIAL**.

Retomada em 17/10/2026: a sessão anterior interrompeu o gate no E2E, sem resultado
final. A retomada executa o Commercial Gate integral novamente; alterações de
implementação anteriores preservadas.

## Branch, HEAD e worktree

Branch `main`; HEAD inicial/final `0285bc6c9201d630b046afecece6879468b12c5a`.
Worktree inicial limpo. FET-SEO-001 estava commitada em 0285bc6, conforme estado
factual, superando a previsão do anexo. Nenhuma alteração anterior descartada.
FET-ORDER-005 permanece **sem commit**, sem push/reset/clean.

## Finding e fronteira comercial

F028 — cancelamento/devolução/reembolso. Parte corrigida: cancelamento de pedido
elegível comprovadamente não pago e anterior a fulfillment + liberação da reserva,
ledger, concorrência, UI/admin, audit e ORDER_CANCELLED. Não é fechamento total.
Refund = BLOCKED_BY_F001; return/reverse logistics =
BLOCKED_BY_F027_AND_BUSINESS_POLICY; auto-expiration = POLICY_UNDEFINED.
Nenhum prazo de devolução, cron, gateway ou timeout de reserva inventado.

## Inventários factuais

Tabelas completas de campos reais, state machine anterior e tipos de movimento
em [CANCELAMENTO_PEDIDOS.md](CANCELAMENTO_PEDIDOS.md).
Order anterior: Processing/Shipped/Delivered; paymentStatus PENDING/PAID;
paidAt BSON Date válido + PAID confirmam pagamento. Legado ausente/desconhecido
é UNVERIFIED. Inventory anterior RESERVED/v1/inventoryReservedAt; Stock é saldo
disponível. Não existia shippedAt no model nem archived boolean; archive usa
administrativeArchivedAt/By. OrderItems conserva snapshot de quantidade/dinheiro.

Movements anteriores: RESERVE (reduz quantidade; delta negativo implícito),
INITIAL_STOCK e ADMIN_ADJUSTMENT (deltas explícitos F037). Novo: RELEASE com
delta positivo igual à quantity, Order/Product/actor/reason/version reais.
Novos estados: orderStatus=Cancelled, inventoryStatus=RELEASED.

## Probe pré-fix

Antes de alterar o backend, um novo pedido válido foi criado pelo runner F039 em
banco temporário com replica set. POST /order/:id/cancel retornou 404; Stock
permaneceu reservado. Probe passou 1/1 comprovando a ausência factual da rota e
do release, sem fabricar bug ou tocar o banco comercial. Teste depois substituído
pela regressão pós-fix permanente.

## Elegibilidade, rotas e autorização

Helper central orderCancellation decide canCancel/blockedReason e integra DTOs.
Serviço revalida estado BSON e ledger dentro da transação. Processing/PENDING
sem paidAt, timestamps de envio/entrega ou cancellation, com RESERVED/v1/timestamp
e um RESERVE íntegro por item é o caso elegível. PAID ou paidAt válido bloqueiam;
timestamp textual/malformado também não autoriza. Shipped/Delivered bloqueiam;
pagamento/inventory legacy unverified exigem revisão. Missing product, overflow,
quantidade/ledger divergente e release prévio falham fechado.

- Cliente: `POST /api/v1/order/:id/cancel`, somente seu Order; alheio/inexistente 404.
- Admin: `POST /api/v1/admin/order/:id/cancel`, mesmos invariantes, sem force.
- Body vazio; quantity/force/free-text/status extras retornam 400.
- Visitante 401; role/CSRF/Origin 403; conflitos comerciais 409 com códigos estáveis.
- No-store, request ID, autenticação F006/F016 e proteções F020/F021 preservados.

## Transação, stock, replay e concorrência

Uma transação snapshot/majority commita Order Cancelled/RELEASED, cancelledAt e
autoria/reasonCode, `$inc` positivo em cada produto, RELEASE por item,
ORDER_CANCELLED via outbox e audit administrativo quando aplicável.
Stock release = quantidade do Order conferida com a reserva, nunca do request ou
recalculada pelo Product atual. Dinheiro/shipping/itens históricos não mudam.

Replay 200 retorna estado atual sem duplicar **Stock, movement, outbox ou audit**.
CAS do Order e retry Mongo não dependem de mutex local ou nova Idempotency-Key.
F005 replay de criação continua retornando o mesmo Order, inclusive cancelado.
Testes com duas requests e duas APIs/processos independentes obtêm um único
release/event/audit. Retry injetado após escrita do audit/outbox aborta a primeira
tentativa e não duplica artefatos. Release vs nova reserva, ajuste absoluto F037,
archive e mudanças de payment/fulfillment mantêm serialização/revalidação.
Multi-item all-or-nothing e falhas Product/movement/outbox/audit cobertos.

## F011, F002, UI, F030 e F040

Archive continua separado; pedido arquivado elegível pode cancelar e ambos os
estados sobrevivem. Cancelado permanece no histórico e DELETE continua 405.
Cancelled não vai a Processing/Shipped/Delivered; PUT não cria cancelamento,
não existe uncancel e não há pagamento fictício para avançar fulfillment.

UI cliente em lista/detalhe e admin em Dashboard/detalhe: botão por DTO,
Dialog acessível, confirmação irreversível, Voltar/Escape/foco/trap, Cancelando…,
guard contra clique duplicado e Alert em conflito. Texto Cancelado e data real.
Lista antiga não reverte estado após mutation; sem novo storage persistente.

cancelledByUserId é PSEUDONYMOUS_IDENTIFIER, registrado no privacy registry e
omitido dos DTOs; referência opcional verificada em audit:users. Retenção UNDEFINED.
Admin pode cancelar reserva de User DEACTIVATED/ANONYMIZED sem reativá-lo.
Worker F040 suprime ANONYMIZED. ORDER_CANCELLED usa dedupe por Order/evento/v1,
sem email/body persistido, template text/HTML pt-BR sem promessa de refund/return.
SMTP não ocorre na transação. Delivery at-least-once/best-effort permanece;
nenhuma garantia exactly-once SMTP é alegada.

## Auditoria

Comando existente estendido: `npm.cmd run audit:orders --prefix ecommerce`.
**READ_ONLY: SIM. Provider calls: ZERO. Real DB: NÃO USADO.**
CLI usa leitura snapshot, autoCreate/autoIndex false, sem apply/repair/cancel/release.
Detecta cancelado com reserva, sem cancelledAt, com payment/envio/entrega,
release ausente/duplicado/incoerente, evento ausente/duplicado e legado não verificado.
Saída só categorias/contagens/IDs técnicos. Nenhum nome, email, endereço ou telefone.
Auditor admin contém ORDER_CANCELLED/reasonCode ADMIN_REQUEST; self-cancel não
polui auditoria administrativa. audit:inventory e contrato F037 reconhecem RELEASE.

## Arquivos criados

- `backend/services/orderCancellationService.js`.
- `backend/utils/orderCancellation.js`, `orderLifecycleAudit.js`.
- `frontend/src/component/Order/CancelOrder.jsx`.
- `tests/orderCancellation.test.js`, `orderCancellationConcurrency.test.js`, `orderLifecycleAudit.test.js`.
- `tests/helpers/orderCancellationFixture.js`, `tests/e2e/orderCancellation.spec.js`.
- `docs/CANCELAMENTO_PEDIDOS.md`, `RELATORIO_FET_ORDER_005.md`, `TESTES_FET_ORDER_005.md`.

Os caminhos backend/frontend/tests acima são relativos a `ecommerce/`.

## Arquivos alterados

Backend: orderController, orderRoute, modelos Order/StockMovement/EmailOutbox,
auditContract, orderHistoryService, helpers orderPayment/orderList/
stockMovementContract/inventoryAudit/orderHistoryAudit/userReferenceAudit/
privacyDataRegistry, CLI auditOrders e email contract/enqueue/templates/worker.
Frontend: Orders, OrderDetails, Dashboard e utils/format.
Testes existentes: emailTemplates.test.js.
Host E2E server.js: conta exclusiva de fixture para isolar os novos cenários.
Docs: ESTOQUE_TRANSACIONAL, HISTORICO_PEDIDOS, IDEMPOTENCIA_PEDIDOS,
EMAILS_TRANSACIONAIS, PRIVACIDADE_E_RETENCAO, OBSERVABILIDADE, ACESSIBILIDADE,
CI_E_GATES_COMERCIAIS, ESTADO_ATUAL_PROJETO_FETECH, PLANO_MELHORIAS_FETECH e ROTAS.md.
Também atualizado ESTADOS_PEDIDO_PAGAMENTO para documentar o estado terminal.

Dependências: **NENHUMA**. Sem lockfile, configuração real ou índice novo.
Índice F037 parcial RESERVE existente continua pré-requisito protegido, não aplicado.

## Validação

Focused cancellation/concurrency/audit/templates: **77/77**, zero skips.
Browser cancellation: **6/6**, zero skips, também aprovados na suíte completa final.
Architecture **155/155**, API final do gate **1.880 aprovados + 15 F024**,
E2E **96/96 em 6,4 min**, zero skips/retries/falhas; axe zero violações nos novos
estados e na suíte F033; build/SEO/bundle/diff aprovados. **Commercial Gate APROVADO**,
exit code 0; npm audits backend/frontend **zero vulnerabilidades**.
Contagens finais, comandos/probes e falhas corrigidas durante a validação
de validação documentados em [TESTES_FET_ORDER_005.md](TESTES_FET_ORDER_005.md).

## Proteções operacionais e estados preservados

Banco real **NÃO ALTERADO**. Gateway **NÃO CHAMADO**. Transportadora **NÃO CHAMADA**.
SMTP real **NÃO CHAMADO**. Cloudinary real **NÃO CHAMADO**. Índices comerciais
**NÃO APLICADOS**. Sem Database Tools baixadas, audit fix ou config.env alterado.
Auditoria histórica **NÃO ALTERADA** (checksum em evidências).

F002–F022/F025/F031/F036–F040 preservados no código; F030/F033 mantêm baselines
técnicos, sem certificação jurídica/WCAG integral. F023 pendente; F024/F026
parciais; F029 aberto; F032 parcial por F023; F039 remoto pendente.
F001/F027 **ADIADOS / NÃO INICIADOS**. F028 **PARCIAL**.

## Inventário de TODOS os findings ainda abertos/parciais

Revisão dos 42 IDs históricos do gerador e status correntes do plano. Não é
nova auditoria de providers/produção e não declara fechados findings sem evidência.

| Finding | Estado/parte pendente | Classe de dependência |
|---|---|---|
| F001 pagamento | Adiado, gateway/webhooks/reconciliação não implementados | Provider/política financeira |
| F023 deployment | Infra, DNS/TLS, hosting, promoção/rollback não comprovados | Operacional/infra |
| F024 backup/restore | Parcial, Tools/restore real bloqueados | Operacional/Tools/backup |
| F026 CI/CD | Parcial; código CI existe, CD/destino pendentes | F023 + operação remota |
| F027 frete | Adiado; quote/carrier/tracking não implementados | Provider/política logística |
| F028 pós-venda | Cancel/release corrigidos; refund/return/expiry pendentes | F001/F027 + política |
| F029 providers | SMTP/Cloudinary reais não validados | Staging/autorização/credenciais |
| F032 SEO | Baseline client-side; origem/sitemap/HTML/status/robots produtivos pendentes | F023 |
| F034 analytics/funil | Sem fechamento formal; definição de negócio/privacidade necessária | Decisão comercial; conversão paga depende F001 |
| F035 documentação | Sem fechamento formal global; revalidar links/contratos/garantias restantes | Candidato independente de provider/infra |
| F039 gates | Código corrigido; enforcement remoto/branch protection pendentes | Acesso/operação remota + F026 |
| F041 operação avançada | Fiscal/variantes/logística/escopo não definidos; opcionais não presumidos | Política comercial/jurídica, fiscal e F027 |
| F042 manutenção dependências | Achado histórico de patches; disponibilidade atual não consultada | Candidato independente: revalidar upstream e CI |

F042 não significa que patches históricos continuam sendo os mais recentes.
Nenhuma consulta npm outdated, atualização ou nova recomendação de versão foi
executada nesta task. F035/F042 podem ser inventariados sem iniciar provider/infra.
Baselines F030/F033/F038 ainda têm validações humanas/jurídicas/field pendentes;
índices F022/F037 aguardam operação protegida e backup, sem reabrir correções de código.
F019 histórico fora do namespace/F040 SMTP real seguem limites já documentados.

## Riscos residuais e próximo passo

Refund depende de F001; return/reverse logistics de F027/política; auto-expiry
indefinida mantém reservas unpaid sem cancelamento manual. Legacy Orders não
verificados exigem revisão. F023/F024/F026/F029, SEO produtivo F032 e validação
remota F039 permanecem pendentes. Stock pode ficar reservado por tempo indefinido.

Próximo passo recomendado: revalidar F035 e F042, os candidatos independentes,
antes de concluir que só restou a fronteira operacional/pagamento/frete. Não
iniciar automaticamente outra task, F001, F027 ou operação comercial.
