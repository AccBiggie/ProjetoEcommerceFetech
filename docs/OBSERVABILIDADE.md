# Observabilidade operacional — FET-OPS-002

FET-ORDER-005: audit admin **ORDER_CANCELLED**, targetType ORDER, reasonCode
ADMIN_REQUEST, transacional e sem shipping/email/telefone/free-text. Self-cancel
não é evento administrativo: evidência em Order/RELEASE/outbox. Request ID,
http.request.error/completed e email.outbox.enqueued permanecem no contrato atual.
Conflitos esperados 409: ORDER_REFUND_REQUIRED, ORDER_RETURN_REQUIRED,
ORDER_PAYMENT_UNVERIFIED, ORDER_INVENTORY_UNVERIFIED e ORDER_NOT_CANCELLABLE.
Não são 500. audit:orders agora inclui lifecycle em leitura snapshot, sem writes
ou providers. [Categorias e operação](CANCELAMENTO_PEDIDOS.md).

## Integração de paginação — F022

Audit API usa parser central page/limit com skip máximo 100000 e booleans hasNext/hasPrevious. Filtros/DTO F025, imutabilidade, Request ID e no-store preservados; count/list em paralelo. audit:indexes separado é somente leitura, sem dados/URI ou import de models. Sem logging de query bruta, timeout global ou nova telemetria. [Contrato](PAGINACAO_E_PERFORMANCE_API.md).


## Product — extensão F037

PRODUCT_CREATED/PRODUCT_UPDATED/PRODUCT_DELETED permanecem; PRODUCT_UPDATED
registra somente changedFields, incluindo derivados recalculados quando mudam.
Product, StockMovement e evento commitam juntos; falhas e retries não deixam
commit parcial ou eventos duplicados. Código de erro PRODUCT_* é permitido no
boundary seguro, com X-Request-Id, sem request body/description/URL no log.
audit:products usa perfil mínimo, driver bruto e snapshot consistente somente
leitura, sem SMTP/HTTP/provider; rejeita --apply/--repair e imprime só IDs/códigos.
[Códigos e implantação](COERENCIA_PRODUTOS.md).

## Lifecycle de User — extensão FET-DATA-003

Eventos USER_DEACTIVATED/USER_REACTIVATED usam actor/target autenticados, metadata fromStatus/toStatus e transaction compartilhada com User. Nenhuma PII/JWT/reset token é copiada. Header, log e audit mantêm correlação. USER_DELETED permanece somente como ação histórica legível; DELETE HTTP é 405 e não cria evento. User/actor histórico é preservado após desativação. [Lifecycle](LIFECYCLE_USUARIOS.md).

Contrato em 08/10/2026. F025 / FET-P1-012: instrumentação da aplicação, sem serviço externo de coleta.

## Correlação por requisição

O primeiro middleware gera UUID v4 com `crypto.randomUUID()` e retorna `X-Request-Id` em respostas 2xx/4xx/5xx, inclusive auth, CSRF, rota desconhecida e método recusado. O header recebido do cliente é ignorado. O ID vive no contexto próprio de `AsyncLocalStorage.run`; auth acrescenta somente `userId` e `role`. O contexto serve à observabilidade; autenticação/autorização continuam em `req.user` e no banco.

O evento de conclusão fecha o contexto capturado da requisição, evitando misturar callbacks de respostas concorrentes. Há um evento por conclusão/aborto, com tempo monotônico `process.hrtime.bigint()`. Referência de comportamento: [AsyncLocalStorage do Node](https://nodejs.org/api/async_context.html).

## Logging

`backend/observability/logger.js` emite uma linha JSON por evento. `debug/info` vão para stdout; `warn/error` para stderr. Não há arquivo rotativo, collector, analytics ou dependência nova.

`LOG_LEVEL` é validado no runtimeConfig F036: `debug`, `info`, `warn`, `error`. Default: `test=error`, `development/production=info`. Valor vazio/desconhecido impede startup; todos os perfis centrais validam essa opção. O exemplo público de configuração foi atualizado, sem modificar `config.env` real.

Exemplo exclusivamente sintético:

```json
{"timestamp":"2026-10-08T18:00:00.000Z","level":"info","event":"http.request.completed","requestId":"11111111-1111-4111-8111-111111111111","method":"PATCH","route":"/api/v1/admin/order/:id/archive","status":200,"durationMs":42,"userId":"111111111111111111111111","role":"admin"}
```

Eventos comuns: `http.request.completed`, `http.request.aborted`, `http.request.error`; eventos úteis de login recusado, rate limit, CSRF, falha de envio de recuperação, replay/falha de pedido, ação administrativa e startup/conexão/falha fatal do processo. Saúde tem completion em debug para evitar flood. Logs 5xx têm code/name permitidos e ID, nunca mensagem livre ou stack, inclusive em development. Startup inválido informa nomes permitidos de variáveis inválidas, sem seus valores. Falhas fatais mantêm encerramento com exit 1. Não foi criado um novo fluxo de graceful shutdown/deployment.

Rotas conhecidas usam `req.route.path` com prefixo API estático. Exemplo de reset: `/api/v1/password/reset/:token`, nunca o token. Requisição desconhecida ou rejeitada antes do roteamento registra `UNMATCHED`. Não se usa `originalUrl`, `baseUrl` dinâmico, parâmetros ou query para formar rota de log. JSON público 5xx recebe mensagem genérica, sem stack ou mensagem de provider. Erros de validação/negócio 4xx mantêm o contrato anterior.

## Redaction e campos proibidos

Não passar bodies, headers, queries, params, documentos completos, config ou exceções livres ao logger. Há duas defesas: helper recursivo que remove valores de chaves sensíveis, e projeção final estrita de campos técnicos. Campos/eventos desconhecidos e mensagens/stacks livres não são serializados. IDs e enums são validados; o contexto interno prevalece sobre ID fornecido pelo chamador do logger. Getters/toJSON arbitrários não são executados; ciclos/profundidade/tamanho são limitados.

Proibidos: password/passwordConfirm, JWT/token/resetToken, Authorization, Cookie/Set-Cookie, Idempotency-Key, X-Fetech-CSRF, DB_URI, JWT_SECRET, SMTP PASSWORD, Cloudinary API keys/secrets; e-mail, nome, endereço/entrega, telefone, CEP, bairro, cidade, número, IP bruto e User-Agent. O helper também mascara padrões de URI/Bearer/JWT/e-mail. Não é detector universal de segredos em texto livre; por isso mensagens livres são omitidas do logger e os campos aceitos têm contratos restritos.

O novo logging não enfraquece o limiter, tokenVersion, cookies, CSRF/no-store ou snapshot. As suites capturam stdout/stderr isoladamente, restauram em `finally` e verificam sentinelas, inclusive falhas de Mongo/SMTP/Cloudinary e JWT/Set-Cookie reais das respostas.

## Health

| Endpoint | Acesso | Resultado |
| --- | --- | --- |
| `GET /api/v1/health/live` | Público | 200 `{"status":"ok"}`, sem consulta ao Mongo |
| `GET /api/v1/health/ready` | Público | 200 quando conexão atual está pronta e hello confirma suporte transacional; 503 `{"status":"unavailable"}` em desconexão/falha/topologia inadequada |

Ambos retornam `Cache-Control: no-store` e Request ID. Ready consulta a conexão existente com timeout de 1000 ms; não conecta/reconecta, não faz reparo e não consulta SMTP/Cloudinary. Respostas não incluem versão, host, database, URI, env ou diagnóstico sensível. Suporte transacional continua obrigatório no startup.

## Inventário das mutações e audit trail

`AdminAuditEvent`, collection `adminauditevents`, versão 1. Campos: createdAt do servidor, requestId, actorUserId/actorRole autenticados, action, targetType/targetId e metadata permitida. Não popula ator/cliente nem copia recurso, body ou credenciais.

| Ação | Método e rota (prefixo `/api/v1`) | Model/recurso | Audit atômico |
| --- | --- | --- | --- |
| `ORDER_ARCHIVED` | PATCH `/admin/order/:id/archive` | Order | Sim |
| `ORDER_UNARCHIVED` | PATCH `/admin/order/:id/unarchive` | Order | Sim |
| `ORDER_STATUS_CHANGED` | PUT `/admin/order/:id` | Order | Sim |
| `USER_ROLE_CHANGED` / `USER_UPDATED` | PUT `/admin/user/:id` | User | Sim |
| `USER_DEACTIVATED` | PATCH `/admin/user/:id/deactivate` | User | Sim |
| `USER_REACTIVATED` | PATCH `/admin/user/:id/reactivate` | User | Sim |
| `PRODUCT_CREATED` | POST `/product/new` | Product | Sim |
| `PRODUCT_UPDATED` | PUT `/product/:id` | Product | Sim |
| `PRODUCT_DELETED` | DELETE `/product/:id` | Product | Sim |
| `CATEGORY_CREATED` | POST `/admin/category` | Category | Sim |
| `CATEGORY_UPDATED` | PUT `/admin/category/:id` | Category e nome denormalizado em Product | Sim |
| `CATEGORY_DELETED` | DELETE `/admin/category/:id` | Category | Sim |
| `PRODUCT_REVIEW_DELETED` | DELETE `/reviews?productId=...&id=...`, quando ator admin | Review dentro de Product | Sim |

GET administrativo é só leitura. DELETE comercial de Order continua 405, sem mutação ou evento de sucesso. Archive/unarchive e transição repetidos são no-op, sem evento fictício. Update de usuário sem diferença de name/email/role não cria evento. Updates aceitos de Product/Category registram operação e lista de campos efetivamente diferentes, possivelmente vazia. Criação de review, edição de perfil/senha, endereços e checkout são fluxos de cliente mesmo quando o cliente tem role admin; não são ações administrativas. Bootstrap/seed/manutenções via CLI não têm ator HTTP e não inventam audit/request IDs. Não há mutação administrativa Cloudinary/SMTP neste inventário; chamadas externas do fluxo de cliente não foram envolvidas em transactions.

Metadata: archive contém somente `archived`; status `from/to` conhecidos; role `fromRole/toRole`; User/Product/Category update `changedFields` de allowlist (nomes de campos, não valores); review delete `reviewId`. Create/delete dos recursos não carregam metadata do documento. Body não escolhe ator, timestamp, action, target ou requestId.

`runAuditedAdminMutation` executa mutação Mongo + insert do evento com a mesma session/transaction, snapshot/majority; falha de audit aborta o estado principal. Sem best effort silencioso, sem emitir resposta de sucesso antes do commit, sem chamadas externas dentro de callback que pode ser repetido. Uso de session explícito em cada operação segue a [documentação transacional do Mongoose](https://mongoosejs.com/docs/transactions.html).

F010 mantém lock distribuído, fencing e recarga de ator/target. Fences de geração e lease permanecem fora da transaction da ação, evitando regredir proteção contra lease expirado; uma ação abortada pode avançar metadata técnica de fencing, sem alterar role/name/email/exclusão. Nenhuma geração é reduzida. Estoque e pagamento não são alterados pelo audit.

## Append-only e limites

Sem API de criação, edição ou exclusão do audit. Model bloqueia updates/replaces/deletes em queries, save/delete de documento existente, bulkWrite/bulkSave e aggregate com `$out/$merge`. Inserts são usados pelo serviço interno. Índices: createdAt/_id descendentes; action + createdAt/_id; targetType/targetId + createdAt/_id; actorUserId + createdAt/_id; requestId. **Sem TTL**, aguardando política F030.

As guardas protegem o runtime normal, não um operador com credenciais de escrita, acesso ao driver cru/collection ou privilégio de restore. Não é trilha criptograficamente inviolável, SIEM ou WORM. Infraestrutura deve limitar acesso à collection e registrar mudanças privilegiadas. Teardown de teste e restauração BSON oficial atuam em nível driver/servidor fora dessas guardas; não são endpoints do produto. O backup genérico F024 inclui a nova collection/índices quando executado, mas continua sem drill real validado.

## Consulta administrativa

`GET /api/v1/admin/audit-events`, com cookie e role admin: sem auth 401, user 403. Resposta privada no-store, sem populate/PII:

```json
{"success":true,"events":[],"pagination":{"page":1,"limit":25,"total":0,"pages":0}}
```

Default page=1/limit=25; limit máximo 100; page máximo 1.000.000, inteiro positivo estrito. Ordenação createdAt DESC, _id DESC. Lista e count são leituras separadas: inserts concorrentes podem alterar total/offset entre páginas; não há snapshot de paginação ou cursor nesta versão.

Filtros opcionais: action/targetType de enum; targetId/actorUserId ObjectId hex; requestId UUID v4; from/to ISO UTC exato `YYYY-MM-DDTHH:mm:ss.sssZ`, intervalo inclusivo e ordenado. Parâmetros desconhecidos, duplicados, arrays, objetos, `$`/operadores e valores inválidos são 400. Filtros são construídos por allowlist, nunca passados diretamente ao Mongo. Não há regex livre.

Dashboard → **Auditoria** apresenta data/hora local, código de ação, recurso ID, ator ID e Request ID, com páginas de 25 e filtro de Request ID. Não exibe nomes/e-mails nem armazena IDs em localStorage. Erro de filtro aparece como mensagem normal; não há edição/exclusão.

## Troubleshooting

1. Obter `X-Request-Id` na resposta relatada pelo usuário; pesquisar o ID nos logs JSON coletados pelo ambiente.
2. Para ação admin, consultar o endpoint com requestId ou a aba Auditoria. O evento usa o mesmo ID da resposta/log.
3. Se 5xx, verificar event/code/name e estado do serviço sem pedir bodies, cookies, senhas ou token de reset. Erros de providers não têm mensagem/stack livre nos logs.
4. Se audit insert falhar, ação principal deve abortar; verificar disponibilidade/permissões/índices. Não desabilitar audit para “destravar” uma ação e não escrever manualmente um evento de sucesso.
5. Se ready=503 e live=200, revisar Mongo/topologia/permissões a partir da infraestrutura; o endpoint não faz recuperação.

LOG_LEVEL=error suprime completion informativo; para correlacionar ações bem-sucedidas usar info. Ativar debug em janela controlada não libera payloads. Identificadores de suporte são técnicos, mas devem seguir política de acesso/retenção.

## Limites operacionais

F025 fecha a camada de código, não provisiona coleta/persistência/rotação/alertas externos. F023 deve configurar stdout/stderr, acesso, load balancer e alarmes. F030 deve definir retenção/privacy dos logs/audit; não foi criado TTL. F034 analytics comercial permanece separado. Crescimento/consulta de audit em datasets produtivos requer observação e ajustes de infraestrutura. Readiness não prova disponibilidade de todas as integrações.

F024 continua **PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE**: nenhum download nesta task, restore real pendente. F001 pagamento e F027 frete continuam adiados. Banco real, config.env e auditoria histórica não foram alterados; fixtures são isoladas e sintéticas.

## Reviews (FET-DATA-004)

Evento `product.review.data_inconsistent`: warn com requestId e targetId do
Product. Erro 409 `PRODUCT_REVIEW_DATA_INCONSISTENT`. Logs nunca incluem textos
das reviews. Admin delete conserva `PRODUCT_REVIEW_DELETED` em transação com
Product; metadata somente reviewId. Cliente comum permanece fora do audit
administrativo. [Contrato](REVIEWS_CONCORRENCIA.md).

## F017 — correlação e atomicidade da hierarquia

CATEGORY_CREATED/UPDATED/DELETED e PRODUCT_CREATED/UPDATED preservam o contrato
F025, Request ID e metadata permitida; parent_id/category_id em changedFields.
Singleton revision, mutação e AuditEvent commitam juntos. Retry abortado não
persiste revision/evento; falha no audit reverte o domínio. Nenhum nome/descritivo
de Category/Product foi acrescentado aos logs. Erros CATEGORY_INVALID_ID,
CATEGORY_PARENT_NOT_FOUND, CATEGORY_HIERARCHY_CYCLE,
CATEGORY_HIERARCHY_DATA_INCONSISTENT, CATEGORY_HAS_CHILDREN e CATEGORY_IN_USE
são códigos estáveis nos logs/responses. Nenhum audit para leitura da árvore.
Contrato: [HIERARQUIA_CATEGORIAS.md](HIERARQUIA_CATEGORIAS.md).
# Atualização FET-MEDIA-001

Eventos user.avatar.updated/upload_failed e media.cleanup.pending/completed/blocked registram IDs técnicos e failureCode allowlisted. Bytes, filename, URLs/publicId e resposta bruta do provider não são logados. audit:media permite identificar intents stale e cleanup pendente/bloqueado sem provider nem mutação. Monitorar backlog e retries; apply requer operador com confirmação da database. [Operação](AVATAR_E_MIDIA.md).
# Privacidade F030

Novo action USER_ANONYMIZED: target USER e metadata allowlisted somente
privacyRequestId; append participa da transação de anonimização. Solicitação/
cancelamento mantêm trilha PrivacyRequest, preservando auditoria exclusiva de
admin. Não registrar confirmação forte, alias, nome/email/endereço antigo,
hash de senha/reset ou resposta bruta do provider. Request ID correlaciona
API e evento. audit:privacy emite apenas contagens/códigos/IDs pseudônimos.
[Contrato](PRIVACIDADE_E_RETENCAO.md).

## F040 — eventos seguros de e-mail

email.outbox.enqueued/sent/retry/dead/suppressed/worker_failed usam outboxId,
eventType, requestId, tentativa e failureCode enumerados. Não serializam recipient,
email, nome, subject/body, senha, erro bruto ou resposta do provider. Send/retry
não cria AdministrativeAuditEvent; admin mantém audit de domínio.
[Contrato](EMAILS_TRANSACIONAIS.md).
