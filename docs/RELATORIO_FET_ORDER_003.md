# Relatório FET-ORDER-003 — histórico comercial preservado

08/10/2026. Escopo: F011 / FET-P0-009.

## Resultado

CONCLUÍDO. Exclusão física de pedidos comerciais substituída por rejeição explícita e arquivamento administrativo reversível. Estoque, ledger, snapshot, centavos e idempotência preservados.

## Branch

`main`.

## HEAD inicial

`5cf41c4d454db742738608876d9fa925f9ee0b51`.

## HEAD final

`5cf41c4d454db742738608876d9fa925f9ee0b51`. Nenhum commit solicitado nesta tarefa.

## Estado do worktree

Inicial limpo. FET-ORDER-002 já commitada; a informação divergente no anexo estava desatualizada. Final com as alterações desta tarefa pendentes, sem reset, clean, alteração de configuração real ou descarte de trabalho anterior.

## Finding tratado

F011 / FET-P0-009 — perda de histórico por exclusão física de pedidos.

## Finding reproduzido antes da correção

Probe real, antes das mudanças de produção, em MongoDB replica set isolado. Pedido legado Shipped, Pending, sem inventoryStatus: DELETE 200; existia antes, não existia depois. Stock 20→20, movimentos 0. ID da fixture: `6ac7ca90bcdd646c62e1e9a8`. Comando: `node ecommerce/tests/runWithReplicaSet.js ../.local/order-history-before.cjs`. Exit 0; evidência local ignorada `.local/order-history-before.log`. Nenhum dado comercial real usado.

## Causa raiz

A guarda anterior protegia apenas RESERVED. O controller executava Order.deleteOne para documentos legados, apagando histórico comercial. O painel apresentava Excluir e não havia barreira geral no modelo.

## Estratégia implementada

DELETE nunca consulta/escreve Order. PATCH explícitos aplicam mudança condicional atômica de dois campos administrativos. Serialização separa metadata administrativa da visão do cliente. Lista e painel filtram arquivamento; modelo e collection recusam operações de exclusão. Auditoria detecta inconsistências sem escrever.

## Contrato DELETE legado

Rota mantida: DELETE `/api/v1/admin/order/:id`. Admin autenticado e CSRF válido: 405, `Allow: PATCH`, JSON `success: false`, mensagem “Pedidos não podem ser excluídos fisicamente.” Vale para qualquer status, legado, RESERVED e ID válido inexistente. ID inválido 400; sessão ausente 401; cliente comum e CSRF/Origin hostis 403. Não arquiva, cancela, estorna ou libera reserva.

## Contrato archive

PATCH `/api/v1/admin/order/:id/archive`, admin e CSRF. 200 com pedido; data e ator definidos pelo servidor. Compare-and-set com administrativeArchivedAt null. Primeira execução grava par; repetições preservam o primeiro ator/data. ID inválido 400, inexistente 404. Campos do corpo não controlam metadata/comercial.

## Contrato unarchive

PATCH `/api/v1/admin/order/:id/unarchive`. Mesmas permissões/validações. Grava ambos os campos null apenas se arquivado; repetição em ativo retorna 200 sem mudança.

## Metadata

administrativeArchivedAt Date|null e administrativeArchivedBy ObjectId<User>|null, select false. Legados com campos ausentes continuam ativos. Nenhuma migração, populate do ator, índice sem uso, TTL ou razão/audit trail completo. Referência do ator preservada após remoção da conta. Escrita atômica evita pares parciais em concorrência.

## Semântica

Arquivar organiza a administração. Preserva ID, orderStatus, paymentInfo, valores/cents, shippingInfo versão 2 com strings e zeros, inventoryStatus/Version/ReservedAt, Stock, StockMovement e claim/hashes. Não é cancelamento, refund, release ou confirmação de pagamento. Transições comerciais existentes continuam funcionando; F002 permanece aberta.

## Customer history

GET /orders/me e GET /order/:id preservam arquivados para o dono. Outro usuário recebe 403. Campos administrativos não aparecem nas respostas do cliente, inclusive criação/replay. Hashes não aparecem em cliente ou admin. Respostas privadas continuam no-store e sem JWT em JSON. E2E verifica histórico e detalhe do cliente após archive por outra sessão admin.

## Admin list

GET /admin/orders?archived=active|archived|all; padrão active, inclusive campos ausentes. Vazios/desconhecidos/repetidos/objetos/arrays: 400. Admin detalhe acessa arquivado. TotalAmountCents/totalAmount e contagem no painel referem-se à lista filtrada. Painel oferece filtro, badge Arquivado e confirmação de arquivamento/desarquivamento com preservação do histórico. Exclusões de produto/usuário mantêm suas confirmações próprias.

## Proteção de physical delete

Hooks query deleteOne/deleteMany/findOneAndDelete, hook document.deleteOne; findByIdAndDelete usa findOneAndDelete. BulkWrite bloqueia deleteOne/deleteMany. Collection do modelo tem barreiras adicionais, incluindo skipMiddleware. Erro `ORDER_PHYSICAL_DELETE_FORBIDDEN`, statusCode 405, sem flag pública de bypass. findOneAndRemove ausente no Mongoose 9.11.0; verificado em teste. Teste arquitetural impede deletes/acesso bruto a orders em controllers/services. Driver nativo privilegiado externo e dropDatabase de teardown permanecem fora da barreira: banco não é imutável, retenção futura exige procedimento separado F030.

## F003/F004 integration

Reserva transacional e ledger não são invocados por archive/unarchive/DELETE. Comparação integral dos documentos comerciais, Stock, movimentos e claims antes/depois em seis combinações de status e legado. Concorrência 10 archives conserva mesmo primeiro par; corrida de archive/unarchive deixa par coerente. Suíte de transações e atomicidade permanece verde.

## F005 integration

Replay após archive e unarchive retorna o mesmo ID, sem nova reserva, movimento ou claim. Perda histórica simulada por acesso nativo em fixture continua falhando fechada. Unique keys e hashes privados não alterados.

## Arquivos criados

- ecommerce/backend/services/orderHistoryService.js
- ecommerce/backend/utils/orderHistoryAudit.js
- ecommerce/backend/scripts/auditOrders.js
- ecommerce/tests/orderHistory.test.js
- ecommerce/tests/orderHistoryAudit.test.js
- ecommerce/tests/e2e/orderHistory.spec.js
- docs/HISTORICO_PEDIDOS.md
- docs/RELATORIO_FET_ORDER_003.md

## Arquivos alterados

Order model/controller/routes; runtimeConfig com perfil orders-audit; Dashboard; package.json com audit:orders; testes api/configSecurity/inventoryTransaction/moneyApi/orderIdempotency e E2E routes. README.md, ROTAS.md, ESTADO_ATUAL_PROJETO_FETECH.md, PLANO_MELHORIAS_FETECH.md, ESTOQUE_TRANSACIONAL.md, IDEMPOTENCIA_PEDIDOS.md. Limpezas destrutivas de fixtures do modelo substituídas pelo driver nativo somente no banco temporário isolado.

## Dependências adicionadas

Nenhuma. package.json só adiciona comando; versões e lockfiles inalterados.

## Testes adicionados

14 focados: seis casos DELETE/archive por Processing/Shipped/Delivered × legado/RESERVED; permissões/CSRF/Origin/IDs; replay/privacidade/filtros/somas; concorrência; guardas modelo/documento/collection/bulk; transições e ator removido; arquitetura; auditoria READ_ONLY/metadata/órfãos/reservas/PII; CLI real somente leitura e rejeição de --apply. E2E novo do cliente arquivado e fluxo do dashboard ampliado para archive/unarchive/DELETE405.

## Testes focados

`node ecommerce/tests/runWithReplicaSet.js --test tests/orderHistory.test.js tests/orderHistoryAudit.test.js`: **14/14**, zero falhas, exit 0. Log local `.local/order-history-focus.log`.

## Testes de audit

Auditoria validada com BSON bruto inconsistente, incluindo data string, ator inválido, metadata parcial, claim COMPLETED órfã, movement órfão e reserva ausente. Arquivado válido contado normalmente, sem reconstrução ou alteração byte a byte. CLI real testa perfil mínimo, READ_ONLY e rejeição de --apply. Logs não contêm PII/hashes/ID do ator. Não foi executada no banco real.

## API completa

`npm.cmd test --prefix ecommerce`: **610/610**, zero falhas, exit 0. Log `.local/order-history-api.log`. Execução anterior detectou somente expectativa antiga de DELETE409 na regressão INV; corrigida para405 e suíte integral reexecutada com sucesso.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: aprovado, exit 0, 1,56 s. Log `.local/order-history-build.log`.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: **29/29**, zero falhas, exit 0, 2,2 min. Log `.local/order-history-e2e.log`. A primeira execução usou build anterior ao ajuste completo do Dashboard; o fluxo esperou Arquivar e falhou. Build atualizado e suíte integral reexecutada com sucesso, incluindo cliente arquivado e painel archive/unarchive.

## git diff --check

`git -c core.safecrlf=false diff --check`: exit 0, sem problemas de whitespace. Avisos de conversão LF/CRLF não são falhas. Verificação final repetida após documentação.

## npm audit

Não executado: nenhuma dependência/lockfile alterado; package.json somente script de auditoria. Nenhuma vulnerabilidade declarada resolvida por esta tarefa.

## Probe DELETE

Antes: 200 e pedido legado desaparece. Depois: seis casos permanentes retornam405/AllowPATCH, mantendo pedido e comparação comercial integral, incluindo Stock/movimentos/claims. ID inexistente válido também405. Permissões e ID inválido permanecem protegidos.

## Probe archive

200; metadata do administrador preenchida, comparação comercial integral idêntica. Repetição retorna mesmo par; dez requisições concorrentes retornam mesma data original. Archived não altera Processing/Shipped/Delivered ou Pending.

## Probe unarchive

200; ambos os campos null, repetição sem alteração comercial. Corrida concorrente archive/unarchive deixa ambos presentes ou ambos null. Stock e ledger preservados.

## Probe customer history

Arquivado presente em /orders/me e /order/:id, outro cliente403, metadata invisível ao cliente e visível ao admin. Histórico/detalhe E2E preservados.

## Probe direct model delete

Dez operações cobertas: deleteOne/deleteMany/findOneAndDelete/findByIdAndDelete/document.deleteOne, collection deleteOne/deleteMany/findOneAndDelete e bulkWrite deleteOne/deleteMany com skipMiddleware. Todas recusadas com código reconhecível, pedido ainda existente. Teardown dos bancos isolados concluído normalmente.

## Probe replay

201, Idempotency-Replayed true, mesmo ID após archive; snapshot comercial/Stock/ledger/claim iguais antes/depois. Após unarchive, mesma key também retorna mesmo ID.

## Banco utilizado

MongoDB real com replica set temporário, porta dinâmica, dbpath .local/test-mongo-rs-*; bancos únicos fetech_routes_auth_*, fetech_history_audit_* e fetech_e2e_*. Runner encerra instâncias de teste e teardown remove apenas bancos de fixture. MongoDB local existente27017 e dados reais não alterados/auditados/reconfigurados. config.env/secrets intocados.

## F003

CONTINUA CORRIGIDO.

## F004

CONTINUA CORRIGIDO.

## F005

CONTINUA CORRIGIDO.

## F006

CONTINUA CORRIGIDO.

## F007

CONTINUA CORRIGIDO.

## F008

CONTINUA CORRIGIDO.

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

CONTINUA CORRIGIDO.

## F036

CONTINUA CORRIGIDO. Evidência: suíte completa verde, build e verificações de segurança no navegador.

## Findings ainda abertos

F001 pagamento real; F002 envio Pending; F022 paginação/escala; F023 deployment/TLS; F024 backup/restore; F025 observabilidade/audit trail completo; F027 frete; F028 cancelamento/devolução/refund/release; F030 retenção/privacy. Arquivamento não fecha essas tarefas.

## Documentação atualizada

Histórico de pedidos e este relatório criados. README/ROTAS/estado/plano atualizados; estoque e idempotência apontam para contrato não destrutivo. Entradas históricas do plano preservadas; a atualização datada descreve o estado vigente.

## Auditoria histórica

NÃO ALTERADA. Relatórios anteriores mantidos como evidência histórica.

## Alterações fora de escopo

NENHUMA. Ajustes de fixtures/expectativas e allowlist do perfil de auditoria necessários à barreira e ao novo contrato. Nenhum gateway, migração de banco real, cancelamento, refund ou início de F002.

## Impacto de compatibilidade

DELETE deixa de funcionar; clientes administrativos precisam usar archive/unarchive. archived é metadata administrativa, não status comercial. Customer history permanece completo. Legados sem metadata não precisam de migração. Totais administrativos agora correspondem ao filtro padrão active.

## Riscos residuais

Pedidos apagados historicamente não são recuperados. Archive não substitui cancelamento. Reservas Pending continuam consumindo Stock. Payment real não existe; refund/release permanecem pendentes. Audit trail completo e retenção legal pendentes. Acesso nativo privilegiado ao MongoDB pode contornar o modelo; F024 backup e F030 procedimento de retenção continuam necessários. Listagem/auditoria ainda sem paginação para escala F022.

## Status da remediação

F011 / FET-P0-009: **CORRIGIDO**. API 610/610, focados14/14, E2E29/29, build e diff check aprovados. Demais findings permanecem no escopo próprio.

## Próxima task recomendada

F002 / FET-P0-002 — impedir avanço de pedidos para envio enquanto pagamento não estiver confirmado, preparando a máquina de estados comercial para integração do gateway. Não iniciada automaticamente.
