# Relatório FET-OPS-002 — Observabilidade e audit trail

08/10/2026 — ProjetoEcommerceFetech.

## Resultado

**CONCLUÍDO.** Camada de observabilidade implementada: correlação por requisição, logs JSON seguros, health e audit administrativo transacional append-only com consulta/UI paginadas. F025 / FET-P1-012 **CORRIGIDO NO CÓDIGO**, com focused/API/build/E2E aprovados. Não representa implantação de collector, SIEM, alerting ou política formal de retenção.

## Branch

`main`.

## HEAD inicial

`aed5bc03298b22a1e6a9e2b77ae06cdce92fc00c`.

## HEAD final

`aed5bc03298b22a1e6a9e2b77ae06cdce92fc00c`. Esta tarefa permanece sem commit.

## Estado do worktree

Inicial limpo; FET-OPS-001 já commitada como `aed5bc0`. Nenhuma alteração anterior descartada. Não foram executados reset/clean ou push. Alterações atuais são desta task e aguardam solicitação de commit.

## Finding tratado

**F025 / FET-P1-012 — ausência de observabilidade operacional e trilha administrativa.**

## Finding confirmado antes da correção

Probe real em replica set temporário: archive de Order retornou 200; `X-Request-Id=null`; `adminauditevents=0`; `GET /health/live=404`. Inspeção do entrypoint e conexão mostrou mensagens textuais por console, sem formato/correlação consistente. Nenhum probe tocou o banco comercial. Essa execução precedeu as alterações de código.

## Estratégia implementada

Middleware inicial gera ID, isola contexto ALS e observa finish/close; logger central aceita somente eventos/campos técnicos conhecidos, com redaction recursiva adicional. Error handler registra code/name, omite mensagens/stacks livres e torna resposta 5xx genérica. Health observa conexão/topologia atual, sem reconectar. Serviço de audit executa mutação Mongo e evento na mesma transaction; API admin-only usa filtros explícitos e paginação. Aba Auditoria consulta sem PII.

## Request ID

UUID v4, `crypto.randomUUID()`, servidor. Cliente controla: **NÃO**. Header: `X-Request-Id`, inclusive 400/401/403/404/405/500 e CSRF pré-parser. Header recebido é ignorado; contexto prevalece sobre fields do logger.

## Async context

`AsyncLocalStorage.run` por request, requestId e, após auth, userId/role. Callbacks de conclusão usam o contexto capturado. Teste de 50 requests simultâneas com delays e async profundo comprovou IDs separados e consistentes. ALS não é usado para autorização/ownership/CSRF.

## Logging

Uma linha JSON: timestamp ISO, level, event e requestId em contexto HTTP. stdout debug/info; stderr warn/error. LOG_LEVEL enum central debug/info/warn/error; default test error, development/production info. Inválido falha F036. Config inválida no startup registra nome da exceção/nomes permitidos de variáveis, sem seus valores. Entry point e database usam logger; política de falha fatal exit 1 preservada. Não houve implantação de graceful shutdown novo; códigos de shutdown reservados no logger não são evidência de fluxo inexistente.

## Request logs

requestId, method, route template/UNMATCHED, status, durationMs monotônico, userId/role quando autenticado. Health completion em debug; falhas têm evento separado. Raw URL: **NÃO**. Body: **NÃO**. Headers: **NÃO**. Query/params/IP/User-Agent: **NÃO**. Reset path registra `:token`, nunca token.

## Redaction

Projeção estrita descarta mensagens/stacks/config/payloads livres; helper central remove chaves sensíveis recursivamente sem executar getters/toJSON, limita ciclos/profundidade e mascara padrões URI/Bearer/JWT/e-mail. Protegidos password/passwordConfirm, JWT/token/resetToken, Authorization, cookies/Set-Cookie, Idempotency-Key, CSRF, DB_URI/JWT_SECRET/SMTP/Cloudinary secrets; nome/e-mail/endereço/telefone/CEP/bairro/cidade/número/IP/User-Agent. Sentinelas em requests, erro Mongo, SMTP e Cloudinary foram testadas; também token real do Set-Cookie de login. Sem estratégia de “regex resolve qualquer secret”: mensagens livres são omitidas.

## Health

Live: `GET /api/v1/health/live`, público, 200 `{status:ok}`, sem Mongo. Ready: `GET /api/v1/health/ready`, público, readyState=1 e hello transacional na conexão existente, timeout 1000 ms. Mongo indisponível/topologia sem transações: 503 `{status:unavailable}`, sem criar conexão/reparo. Ambos no-store, ID e body mínimo.

## Audit model

`AdminAuditEvent` / `adminauditevents`: eventVersion=1, createdAt servidor, requestId, actorUserId, actorRole=admin, action, targetType, targetId, metadata. Índices createdAt/_id DESC; action/createdAt/_id; targetType/targetId/createdAt/_id; actorUserId/createdAt/_id; requestId. TTL: **NENHUM** até F030. Updates/replaces/deletes, save/delete de documento existente, bulkWrite/bulkSave e aggregate output bloqueados no model. Sem endpoints de escrita. Guardas não substituem privilégios Mongo contra operador/driver cru/restore; não são WORM ou assinatura criptográfica.

## Ações administrativas auditadas

Inventário de todas as rotas authorizeRoles(admin), incluindo privilégio admin no deleteReview. Prefixo real `/api/v1`:

| Action | Route | Target/model | Atomic audit |
| --- | --- | --- | --- |
| ORDER_ARCHIVED | PATCH `/api/v1/admin/order/:id/archive` | ORDER/Order | Sim |
| ORDER_UNARCHIVED | PATCH `/api/v1/admin/order/:id/unarchive` | ORDER/Order | Sim |
| ORDER_STATUS_CHANGED | PUT `/api/v1/admin/order/:id` | ORDER/Order | Sim |
| USER_ROLE_CHANGED / USER_UPDATED | PUT `/api/v1/admin/user/:id` | USER/User | Sim |
| USER_DELETED | DELETE `/api/v1/admin/user/:id` | USER/User | Sim |
| PRODUCT_CREATED | POST `/api/v1/product/new` | PRODUCT/Product | Sim |
| PRODUCT_UPDATED | PUT `/api/v1/product/:id` | PRODUCT/Product | Sim |
| PRODUCT_DELETED | DELETE `/api/v1/product/:id` | PRODUCT/Product | Sim |
| CATEGORY_CREATED | POST `/api/v1/admin/category` | CATEGORY/Category | Sim |
| CATEGORY_UPDATED | PUT `/api/v1/admin/category/:id` | CATEGORY/Category + denormalização Product | Sim |
| CATEGORY_DELETED | DELETE `/api/v1/admin/category/:id` | CATEGORY/Category | Sim |
| PRODUCT_REVIEW_DELETED | DELETE `/api/v1/reviews`, ator admin | PRODUCT/Product.reviews | Sim |

GETs não criam audit. DELETE Order permanece 405 sem alteração/evento. Mesmo estado/archive repetidos são no-op, sem evento fictício; User sem diferenças idem. Product/Category update concluídos registram changedFields efetivos, podendo ser vazios. Fluxos de cliente (review create, checkout, perfil, senha, endereços), bootstrap/seed/manutenções CLI não são ações admin HTTP; não inventam ator/Request ID. Não há provider externo nas mutações administrativas inventariadas; uploads/SMTP do cliente permanecem fora do wrapper.

## Metadata auditada

Archive: archived boolean. Status: from/to enumerados. Role: fromRole/toRole enumerados. User/Product/Category update: changedFields de allowlist, sem valores. Review: reviewId. Create/delete: objeto vazio. Não copia body, PII, hashes internos ou secrets; campos do cliente não escolhem action/actor/target/timestamp/requestId.

## Atomicidade

Todas as ações da tabela usam mutation + audit na mesma session, snapshot/majority e commit antes da resposta. Insert falho aborta ação, sem best effort. Onze tipos de mutação foram testados com falha de insert; também rename Category com atualização denormalizada de Product aborta junto. Lock/lease/fencing F010 permanecem fora da transaction principal para preservar gerações/recarga/último admin. Fencing técnico pode avançar numa ação abortada, sem alterar seu estado comercial principal. Nenhuma network call entra no callback transacional.

## Audit read API

GET `/api/v1/admin/audit-events`; cookie + admin, user=403/sem auth=401; no-store. page=1, limit=25, máximo100, page máximo1.000.000. Ordenação createdAt/_id DESC. Filtros action, targetType, targetId, actorUserId, requestId, from/to UTC ISO estrito. Queries duplicadas/arrays/objects/unknown/operadores são recusadas400; sem filtro Mongo livre/regex. DTO explícito não popula User. Count/list em leituras separadas, sem promessa de snapshot de paginação sob inserts concorrentes. UI simples: aba Auditoria, lista de IDs/ação/data, filtro por Request ID, páginas de25, sem storage persistente de IDs.

## Correlation

Header → log: **SIM**, testado. Header → AuditEvent: **SIM**, testado. Browser → audit API/UI: **SIM**, E2E aprovado. Eventos gravados usam o ID server-side da resposta que causou a ação.

## Arquivos criados

- `backend/observability/context.js`, `logger.js`, `redact.js`, `auditContract.js` (sob `ecommerce`).
- `ecommerce/backend/middleware/requestContext.js`.
- `ecommerce/backend/models/adminAuditEventModel.js`.
- `ecommerce/backend/services/adminAuditService.js`.
- `ecommerce/backend/routes/healthRoute.js`, `adminAuditRoute.js`.
- `ecommerce/frontend/src/component/Admin/AuditTrail.jsx`.
- `ecommerce/tests/observability.test.js`, `adminAudit.test.js`, `helpers/observabilityHarness.js`, `e2e/observability.spec.js`.
- `docs/OBSERVABILIDADE.md`, `TESTES_FET_OPS_002.md`, este relatório.

## Arquivos alterados

App/server, runtimeConfig/database/config.env.example, quatro controllers administrativos, middleware auth/rate limit/CSRF/error; services adminSafety/orderHistory/orderStateMachine e helper categories para session explícita; Dashboard e teste PR-15 de recuperação. Documentos listados na seção Documentação. Nenhuma dependência/package/lockfile alterada.

## Dependências adicionadas

**NENHUMA.** Node/driver/Mongoose já presentes; sem tracker/stack externa.

## Testes adicionados

Lista individual completa: [TESTES_FET_OPS_002.md](TESTES_FET_OPS_002.md). 59 observabilidade +57 admin audit; 1 E2E novo e PR-15 adaptado para validar novo evento JSON, sem relaxar proteção de PII. Captura de streams isolada por processo de teste, restaurada em finally.

## Testes focados

`node --test ecommerce/tests/observability.test.js`: **59/59**, 3,580 s na execução final, exit0.

`node --test ecommerce/tests/adminAudit.test.js`: **57/57**, 5,468 s, exit0.

Regressão intermediária adminSafety/orderStateMachine/orderHistory/routes: **106/106**, 15,400 s.

## API completa

`npm.cmd test --prefix ecommerce`: **837 casos, 822 pass, 15 skipped, 0 fail**, 60,186 s na execução final, exit0. Os skips continuam apenas nos casos F024 dependentes de mongodump/mongorestore; não foram convertidos em aprovação de restore. A execução final repetiu a suíte após reforçar os fallbacks de errorName/errorCode; build e E2E já haviam passado, sem alteração posterior no frontend ou nos contratos HTTP.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: **APROVADO**, 893 ms, exit0.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: **31/31 aprovados**, 2,3 min, exit0. Inclui teste novo de categoria via browser, header, evento correspondente e visualização/filtro na aba Auditoria.

## git diff --check

`git -c core.safecrlf=false diff --check`: **APROVADO**, inclusive após documentação final. Nenhum secret, log ou dump versionado.

## npm audit

Executado: **NÃO**. Nenhuma dependência/package/lockfile mudou; não obrigatório conforme task. Não usar isso para inferir estado atual de vulnerabilidades. Nenhum audit fix.

## Probe request correlation

Request ID: `<omitido>`. Archive200; header UUID, completion e admin.action.completed com mesmo ID; AuditEvent.ORDER_ARCHIVED com mesmo ID/ator/target: **SIM**. Evidência em AUD-01, sem PII impressa.

## Probe redaction

JWT sentinel vazou: **NÃO**. Password: **NÃO**. Cookie/Set-Cookie: **NÃO**. Idempotency-Key: **NÃO**. Reset token: **NÃO**. PII: **NÃO**. Config/provider secret: **NÃO**. Provas em casos OBS de captura real e redaction recursiva, inclusive Mongo/SMTP/Cloudinary. Não foi imprimido o conteúdo sensível para demonstrar a ausência.

## Probe health

Live=200 sem consulta Mongo. Ready em replica set saudável=200. Ready após desconectar Mongo=503, sem reconectar. Ready com comando falho/sem topology transacional=503. Bodies mínimos e no-store comprovados.

## Probe append-only

Update/replace/delete via model/query/documento: rejeitados. Bulk com tentativa de desabilitar middleware: rejeitado. Aggregate `$out`: rejeitado. Falha de insert audit: estado principal não aplicado. Acesso privilegiado raw Mongo é limite de infraestrutura, não endpoint disponível.

## Banco utilizado

Somente replica sets/database `fetech_*_<pid>_<timestamp>` temporários e fixtures sintéticas; teardown restrito à própria base de teste. Nenhum probe HTTP ao sistema comercial em execução. **BANCO REAL NÃO ALTERADO.** `config.env` não sobrescrito.

## F024

**CONTINUA PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE.** Tools não instaladas; restore drill real não executado. Esta task **não baixou** ferramentas e não alegou restore validado. Scripts e runbook FET-OPS-001 preservados.

## F002

**CONTINUA CORRIGIDO** — envio bloqueado sem confirmação.

## F003

**CONTINUA CORRIGIDO** — overselling prevenido.

## F004

**CONTINUA CORRIGIDO** — atomicidade Order/Stock/ledger/claim.

## F005

**CONTINUA CORRIGIDO** — idempotência persistente.

## F006

**CONTINUA CORRIGIDO** — JWT revogável/replay.

## F007

**CONTINUA CORRIGIDO** — cookie de auth.

## F008

**CONTINUA CORRIGIDO** — limiter distribuído.

## F009

**CONTINUA CORRIGIDO** — recuperação uniforme.

## F010

**CONTINUA CORRIGIDO** — último admin/lock/fencing/autoproteção.

## F011

**CONTINUA CORRIGIDO** — histórico sem exclusão física.

## F012

**CONTINUA CORRIGIDO** — snapshot íntegro de entrega.

## F013

**CONTINUA CORRIGIDO** — validação estrita checkout/quantity.

## F014

**CONTINUA CORRIGIDO** — dinheiro exato em centavos.

## F020

**CONTINUA CORRIGIDO** — Helmet/CSP/CSRF.

## F021

**CONTINUA CORRIGIDO** — JWT fora do JSON/no-store.

## F036

**CONTINUA CORRIGIDO** — configuração central/fail-fast, com LOG_LEVEL validado.

## Findings adiados por decisão do usuário

**F001 pagamento e F027 frete: NÃO INICIADOS.**

## Findings ainda abertos independentes

F015 reviews concorrentes; F016 órfãos/lifecycle; F017 hierarquia concorrente de categorias; F018/F019 uploads/avatar; F022 paginação/performance geral; F023 deployment; F028 lifecycle pós-venda; F029 integrações reais; F030 privacy/retention; F031 storage corrompido; F032/F033/F034/F035/F037/F038/F039/F040/F042 e demais itens sem remediação específica. Audit de review/delete user/category não corrige esses respectivos lifecycles/conflitos. F024 continua parcial; F001/F027 adiados.

## Documentação atualizada

Criados OBSERVABILIDADE, relatório e lista individual de testes; atualizados CONFIGURACAO, ROTAS (raiz), AUTENTICACAO, HISTORICO_PEDIDOS, ESTADOS_PEDIDO_PAGAMENTO, ESTADO_ATUAL_PROJETO_FETECH e PLANO_MELHORIAS_FETECH. Exemplo config.env.example atualizado; config.env real preservado.

## Auditoria histórica

**NÃO ALTERADA.** Nenhum relatório histórico foi reescrito para remover findings.

## Alterações fora de escopo

**NENHUMA.** UI mínima autorizada e testes necessários; sem collector/deploy/payment/freight/tools download/migração real ou próxima task.

## Riscos residuais

Coleta/persistência/rotação/acesso e health no load balancer dependem de F023. Alerting/SIEM/distributed tracing/metrics externos não existem. Retenção de log/audit depende de F030; collection cresce sem TTL. Audit runtime não é inviolável contra operador/raw driver e não substitui SIEM. Readiness não prova SMTP/Cloudinary. Paginação offset/count pode variar sob inserts concorrentes; desempenho produtivo depende de dataset/infra. Metadata técnica de fencing pode avançar mesmo quando a ação auditada aborta. F024 espera tools/drill; pagamento/frete continuam adiados.

## Status da remediação

**F025 / FET-P1-012: CORRIGIDO NO CÓDIGO** para a instrumentação/audit administrativo mínimo aqui descritos. Validação completa de browser aprovada. Não fecha F023/F030/F034/F024.

## Próxima task recomendada

**F016 / FET-P1-003 — eliminar dados órfãos na exclusão de usuário e definir lifecycle referencial seguro entre User, Address, Orders, Reviews e demais documentos dependentes.** Não iniciada automaticamente. Pagamento e frete permanecem adiados.
