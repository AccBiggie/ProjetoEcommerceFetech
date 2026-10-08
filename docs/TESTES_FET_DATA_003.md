# Testes permanentes — FET-DATA-003

96 casos focados aprovados (77 lifecycle, 19 auditoria referencial) e um novo fluxo E2E integrado. Fixtures sintéticas em replica set temporário; nenhum banco comercial. Os números UL correspondem aos requisitos do anexo e alguns casos verificam invariantes relacionadas em uma mesma execução.

## Lifecycle (77 casos)

- UL-01 novo User persistido ACTIVE com metadata nula
- UL-02 legacy missing autentica/lista ACTIVE sem escrever migration
- UL-03 DELETE legado retorna 405 Allow PATCH sem desativar
- UL-09 desativação altera estado/metadata/versão e respeita body controlado no servidor
- UL-10 segunda desativação mantém timestamp/actor/versão e um evento
- UL-11 reativação mantém versão, limpa metadata e não emite sessão
- UL-12 reativação idempotente não cria evento nem incrementa versão
- UL-13/14 ciclos múltiplos mantêm invariantes e versões crescentes
- UL-15 auto-desativação administrativa é proibida
- UL-16 user não pode deactivate
- UL-17 visitante não pode deactivate
- UL-18 CSRF inválido bloqueia deactivate sem modificar estado
- UL rota deactivate rejeita ID inválido e inexistente
- UL-16 user não pode reactivate
- UL-17 visitante não pode reactivate
- UL-18 CSRF inválido bloqueia reactivate sem modificar estado
- UL rota reactivate rejeita ID inválido e inexistente
- UL-19/20 último admin ACTIVE não pode ser desativado, inativos não contam
- UL-21 demotion considera somente admins ativos
- UL-22/23 concorrência deactivate + deactivate
- UL-22/23 concorrência deactivate + demote
- UL-24 bootstrap com zero ativos cria novo admin sem reativar o antigo
- UL-25 CLI com somente admin desativado exige confirmação e cria conta nova com senha oculta
- UL-26/27 cookie anterior revogado e incremento único
- UL-28 JWT fabricado com versão atual também bloqueado por status
- UL-29/30 login de conta desativada usa erro genérico e não emite cookie
- UL-31 login desativado continua contando falhas no limiter
- UL-32/33/34 forgot desativado uniforme com timing floor e sem token/email
- UL-35/36/37 reset anterior invalidado, nunca reativa ou emite cookie
- UL reset de conta inativa com token raw existente também é bloqueado
- UL-38/39/40 reativado aceita novo login sem restaurar JWT anterior
- UL-41 email da conta desativada continua reservado
- UL referências address intactas após DELETE/desativar/reativar
- UL referências order intactas após DELETE/desativar/reativar
- UL referências product intactas após DELETE/desativar/reativar
- UL referências claims intactas após DELETE/desativar/reativar
- UL referências movements intactas após DELETE/desativar/reativar
- UL referências audits intactas após DELETE/desativar/reativar
- UL-55/56 admin histórico desativado mantém Audit.actor e archivedBy resolvidos
- UL-57/58/59/60 auditoria USER_DEACTIVATED correlacionada sem PII
- UL-62 falha de auditoria reverte deactivate integralmente
- UL-57/58/59/60 auditoria USER_REACTIVATED correlacionada sem PII
- UL-62 falha de auditoria reverte reactivate integralmente
- UL-61 operação proibida não cria evento de sucesso
- UL-63/64/65 filtro active
- UL-63/64/65 filtro deactivated
- UL-63/64/65 filtro all
- UL-63/64/65 filtro default ativo
- UL-66 rejeita filtro banana
- UL-66 rejeita filtro ACTIVE
- UL-66 rejeita filtro
- UL-66 rejeita filtro active&status=all
- UL-66 rejeita filtro active&status[x]=all
- UL-67 detalhe administrativo de conta desativada inclui metadata técnica segura
- UL-68 serializers públicos não vazam deactivatedBy/at/fence/password
- UL-69/70/71/72 guarda física findOneAndDelete
- UL-69/70/71/72 guarda física findByIdAndDelete
- UL-69/70/71/72 guarda física deleteOne
- UL-69/70/71/72 guarda física deleteMany
- UL-69/70/71/72 guarda física document.deleteOne
- UL-69/70/71/72 guarda física collection.deleteOne
- UL-69/70/71/72 guarda física collection.deleteMany
- UL-69/70/71/72 guarda física bulkWrite
- UL-69/70/71/72 guarda física bulkWrite.skipMiddleware
- UL-69/70/71/72 guarda física replaceOne
- UL-69/70/71/72 guarda física findOneAndReplace
- UL-69/70/71/72 guarda física aggregate.$out
- UL-74/75 controllers/services/seeds não usam User delete/raw users collection
- UL cadastro/perfil/admin update ignoram injeção de lifecycle
- UL status inválido null falha fechado em auth/login/recovery
- UL status inválido UNKNOWN falha fechado em auth/login/recovery
- UL save de senha atrasado não reabre conta desativada
- UL forgot pausado antes de save não recria token após desativação
- UL desativações concorrentes idempotentes geram uma revogação/evento
- UL-73 dropDatabase isolado funciona sem bypass de exclusão do model
- UL reset pausado durante bcrypt perde CAS após desativação
- UL login pausado ao comparar senha não emite cookie após desativação

## Auditoria referencial (19 casos)

- URA-01 empty references produces safe READ_ONLY summary
- URA orphan detected for Address.user without PII
- URA orphan detected for Order.user without PII
- URA orphan detected for Order.administrativeArchivedBy without PII
- URA orphan detected for OrderIdempotency.user without PII
- URA orphan detected for Product.user without PII
- URA orphan detected for AdminAuditEvent.actorUserId without PII
- URA orphan detected for User.deactivatedBy without PII
- URA Product embedded review user orphan detected
- URA active/deactivated/legacy references all resolve without false orphans
- URA optional absent Product.user/archive actor and reserved bootstrap ID ignored
- URA malformed status UNKNOWN reported
- URA malformed status null reported
- URA missing deactivation metadata reported
- URA active with leftover metadata reported
- URA invalid reference does not expose supplied string
- URA auditor is read only: exact snapshots and native write methods forbidden
- URA dedicated config profile accepts DB only without secrets
- URA script has no mutation/repair flags or production delete bypass

## E2E adicionado

- lifecycle: status/filtros, desativar revoga sessão, reativar exige login novo e audita

## Regressões preservadas

API: 933 casos, 918 aprovados e 15 skips exclusivos F024. E2E: 32/32. Adaptações nos testes existentes substituem o contrato de exclusão física pela desativação, preservando as assertivas de sessão, concorrência, ownership, CSRF, cookie, no-store, fencing e rollback. Limpeza destrutiva de User só ocorre em fixtures temporárias guardadas pelo nome/PID; dropDatabase de teardown foi testado explicitamente.

## Cobertura dos 90 requisitos do anexo

| Requisitos | Evidência permanente |
| --- | --- |
| 01–03 | UL-01, UL-02 e UL-03 |
| 04–08 | UL referências address/order/product/claims/audits após DELETE/desativar/reativar |
| 09–14 | UL-09, UL-10, UL-11, UL-12, UL-13/14 |
| 15–18 | UL-15, UL-16, UL-17 e UL-18 para ambas as rotas |
| 19–23 | UL-19/20, UL-21 e UL-22/23; AS-01..12/33..36 |
| 24–25 | UL-24, UL-25 e AS-17..21/27..30/32/37 |
| 26–31 | UL-26/27, UL-28, UL-29/30 e UL-31 |
| 32–37 | UL-32/33/34, UL-35/36/37 e reset com token raw |
| 38–41 | UL-38/39/40 e UL-41 |
| 42–54 | UL referências address/order/product/claims/movements; snapshots completos antes/depois |
| 55–56 | UL-55/56 admin histórico, archivedBy e audit actor |
| 57–62 | UL-57/58/59/60, UL-61 e UL-62 rollback para deactivate/reactivate |
| 63–68 | UL-63/64/65, UL-66, UL-67 e UL-68 |
| 69–75 | UL-69/70/71/72 guards, UL-73 dropDatabase e UL-74/75 arquitetura/seed |
| 76 | orderStateMachine.test.js (shipping sem pagamento) |
| 77 | inventoryTransaction.test.js e snapshots de Stock/ledger |
| 78 | orderIdempotency.test.js |
| 79 | auth.test.js e UL replay/CAS |
| 80 | authCookieSecurity.test.js |
| 81 | rateLimit.test.js e UL-31 |
| 82 | passwordRecoverySecurity.test.js e UL-32/33/34 |
| 83 | adminSafety.test.js e UL-19..25 |
| 84 | orderHistory.test.js e UL-55/56 |
| 85 | checkoutValidation.test.js, shippingSnapshotAudit.test.js e E2E shipping.spec.js |
| 86 | money*.test.js e snapshots de pedido |
| 87 | httpSecurity.test.js e UL-18 |
| 88 | privateResponseSecurity.test.js e privateReply UL |
| 89 | observability.test.js, adminAudit.test.js e UL audit/log |
| 90 | configSecurity.test.js e URA perfil users-audit |

## Skips F024 (15)

- BACKUP mongodump/mongorestore reais, archive completo, manifesto e source intacta # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP collections, contagens, índices e dados BSON restaurados iguais # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP cents, shipping strings, payment, archive, tokenVersion e hashes preservados # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP claims e movements mantêm relações e reserva transacional # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP leitura funcional de Order/Product/User no alvo sem criar índices # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP restore repetido/destino não vazio aborta sem alteração # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP segunda captura usa diretório diferente sem overwrite # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP archive adulterado rejeitado antes de qualquer write # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP manifesto adulterado rejeitado antes de qualquer write # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP versão de manifesto desconhecida rejeitada # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP path traversal em metadata não constrói comandos/arquivos # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP partial e manifesto ausente são rejeitados # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP verifier detecta alteração de conteúdo mesmo mantendo count # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP falha real de tool não publica backup final ou restore validado # MongoDB Database Tools ausentes: restore real bloqueado.
- BACKUP fluxo completo preserva origem e verificação separada READ_ONLY # MongoDB Database Tools ausentes: restore real bloqueado.
