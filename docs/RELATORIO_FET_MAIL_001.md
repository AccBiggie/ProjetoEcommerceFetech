# Relatório FET-MAIL-001 — F040

## Resultado e Git

**CONCLUÍDO — F040 CORRIGIDO NO CÓDIGO**, conforme validação final abaixo.
SMTP/provider real: **NÃO VALIDADO**. Branch `main`; HEAD inicial/final
`613f18b1a582ad9667dfc184486b6dfdb820b761`. F030 já commitada.

Inventário original em 09/10/2026 iniciou com worktree limpo. Retomada em
13/10/2026 começou com implementação parcial, testes e documentação pendentes.
Todas essas alterações foram preservadas/completadas; tarefa continua **sem
commit**, sem push/reset/clean. A inicialização local pedida em 12/10 foi uma
operação separada; não é evidência de teste SMTP nem de conclusão desta tarefa.

## Inventário anterior e reprodução

| Fluxo | Trigger | Provider anterior | Síncrono | Durável |
| --- | --- | --- | --- | --- |
| Recuperação de senha | POST password/forgot | Nodemailer em sendEmail | Sim | Apenas hash/expiração em User; sem evento |
| Cadastro | POST register | Nenhum | Não se aplica | Não |
| Pedido | Commit de Order | Nenhum | Não se aplica | Não |
| Lifecycle | Deactivate/reactivate | Nenhum | Não se aplica | Não |
| Privacidade | Solicitação | Nenhum | Não se aplica | Não |

Gap reproduzido em fixture temporária antes do enqueue: Order persistido **1**,
eventos ORDER_CREATED **0**, esperado **1** (f040-prefix.log, assert 0 !== 1).
Não foi inventada falha SMTP no checkout: antes ele não chamava email.

## Implementação

Adapter real: Nodemailer/SMTP, reutiliza HOST/PORTEMAIL/USER/PASSWORD/EMAIL_SECURE,
remetente USER e FRONTEND_URL validado. Transporte lazy com timeouts 10/10/20s;
sem rede ao importar. Fake somente em testes, injetado. Controllers comerciais
não chamam provider. F009 permanece envio direto controlado: token/link secreto
nunca entra no outbox; resposta uniforme, timing floor, hash/expiração/cleanup
preservados. Não houve chamada SMTP real nesta retomada.

Eventos: ACCOUNT_REGISTERED, ORDER_CREATED, ACCOUNT_DEACTIVATED,
ACCOUNT_REACTIVATED, PRIVACY_REQUEST_CREATED. Não implementados: pagamento,
envio, tracking, marketing, conclusão de anonimização ou reset via outbox.

EmailOutbox contém IDs, eventType/schemaVersion, entityType/entityId,
recipientUserId, dedupeKey, estados, tentativas/data de retry, lease UUID/expiração,
lastErrorCode enumerado, providerMessageId hashed, requestId, sentAt/suppressedAt
e timestamps. **Email/nome/subject/body/reset token/erro bruto armazenados: NÃO.**
Schema estrito, dedupeKey unique, índices status/nextAttemptAt/createdAt/_id e
status/leaseExpiresAt; sem TTL. Registry classifica IDs como pseudônimos;
retentionPeriod UNDEFINED. Não confundir identificador pseudônimo com anônimo.

Enqueue é parte da transação de domínio, não compensação posterior. ORDER_CREATED
participa de Order + Stock + ledger + claim COMPLETED. Falha aborta tudo; F005
replay/concurrency produz um Order/evento. Registration é transacional; lifecycle
usa tipo/versão; privacy request deduplica pela entidade. SMTP ocorre fora da
request e da transação. Não há tentativa de rollback do pedido após falha SMTP.

Logging pós-commit de transações sem email não carrega o modelo do outbox;
isso evita index builds assíncronos desnecessários interferindo em snapshots
read-only. A regressão inicial da auditoria do catálogo foi corrigida; os nove
testes correspondentes passaram, mantendo os asserts de documentos/índices.

## Worker, entrega e falhas

Claim atômico MongoDB, duas conexões e dois processos testados; sem mutex local,
Redis ou garantia baseada em memória. Lease UUID de 60s; token/expiração exigidos
para finalizar. Expiradas podem ser recuperadas; owner antigo não envia na
revalidação. Batch 10 sequencial, polling 5s, stop impede novos claims e espera
limitada a 5s antes de fechar provider. Test e dev sem SMTP não iniciam worker/rede.

Estados PENDING/PROCESSING/RETRY/SENT/DEAD/SUPPRESSED. Máximo 6 tentativas;
backoff 1min/5min/30min/2h/12h. Claims interrompidos também consomem tentativa;
última lease expirada vira DEAD. Rejeição permanente/template inválido vira DEAD,
sem loop infinito ou remoção automática. Código de erro seguro, sem resposta bruta.

Evento: criação idempotente/exactly-once por dedupe + commit. SMTP:
**at-least-once/best-effort, com limite de tentativas**; não prova entrega na inbox.
Exactly-once SMTP alegado: **NÃO**. Antes do send, crash recupera lease. Depois
do aceite e antes de SENT, falha pode causar duplicata no retry. Timeout após
aceite também é ambíguo. X-Fetech-Event-Id permite correlação; não garante dedupe
externo. Não há commit atômico Mongo/SMTP.

Email é resolvido no User atual e rechecado antes de I/O; inexistente/inválido/
ANONYMIZED gera SUPPRESSED. DEACTIVATED continua elegível para sua notificação.
Não recupera email antigo de Order. Uma mudança após a última leitura e um
send já em andamento continuam janelas externas inevitáveis desta implementação.
F030 permanece baseline técnico, sem conclusão jurídica ou prazo legal inventado.

## Templates, dinheiro e logs

Text + HTML com escaping; conteúdo server-controlled, sem nomes/endereços,
sem tracking pixel. ORDER_CREATED diz recebimento do pedido e total histórico em
centavos; não diz pago/enviado. Links apenas FRONTEND_URL validado, sem Host/Origin.

Logs enqueued/sent/retry/dead/suppressed/worker_failed usam IDs, tipo, requestId,
tentativa e código seguro. Email/body/secret/erro bruto nos logs: **NÃO**.
Send/retry não cria AdministrativeAuditEvent; F025 de domínio segue preservado.

## Operação e audit

`npm.cmd run email:outbox:once --prefix ecommerce`: DRY_RUN por padrão, sem rede
ou writes. Apply exige `--apply --confirm-db NOME_EXATO`; confirmação incompleta/
incorreta aborta. Nesta retomada apply só foi chamado em fixture, com fake.

`npm.cmd run audit:email-outbox --prefix ecommerce`: READ_ONLY, snapshot, sem
provider/autoCreate/autoIndex/argumentos. Categorias STALE_PROCESSING, OVERDUE_RETRY,
DEAD, INVALID_STATE, SENT_WITHOUT_SENT_AT, PENDING_FOR_ANONYMIZED_USER,
MISSING_RECIPIENT_USER e FORBIDDEN_CONTENT, com prefixo EMAIL_OUTBOX_.
Operacionais são separados de integridade. IDs/timestamps/leases malformados
são sinalizados sem echo; referência histórica não vira operador de query.
Documentos/indexes preservados; nenhum apply/reparo automático.

## Arquivos e dependências

Arquivos criados:

- backend/models/emailOutboxModel.js
- backend/services/email/{contract,enqueue,emailProvider,smtpEmailProvider,templates,worker}.js
- backend/utils/emailOutboxAudit.js
- backend/scripts/{auditEmailOutbox,emailOutbox}.js
- tests/{emailOutbox,emailWorker,emailTemplates,emailOutboxAudit}.test.js
- tests/helpers/fakeEmailProvider.js
- tests/e2e/emailOutbox.spec.js
- docs/{EMAILS_TRANSACIONAIS,RELATORIO_FET_MAIL_001,TESTES_FET_MAIL_001}.md

Caminhos de backend/tests acima são relativos a ecommerce. Alterados:
runtimeConfig, orderController, userController, logger, server, adminAuditService,
adminSafetyService, orderInventoryService, privacySensitiveWrite, privacyService,
privacyDataRegistry, sendEmail, package.json (scripts) e configSecurity.test.js.
Documentação integrada: CONFIGURACAO, AUTENTICACAO, IDEMPOTENCIA_PEDIDOS,
ESTOQUE_TRANSACIONAL, PRIVACIDADE_E_RETENCAO, LIFECYCLE_USUARIOS,
OBSERVABILIDADE, CI_E_GATES_COMERCIAIS, ESTADO_ATUAL_PROJETO_FETECH e
PLANO_MELHORIAS_FETECH. Auditoria histórica não alterada.

Dependências adicionadas: **NENHUMA**. Lockfiles preservados; nenhum audit fix.
Alterações fora do escopo nesta retomada: **NENHUMA**.

## Validação

Lista individual dos **107 testes focados + 1 E2E**:
[TESTES_FET_MAIL_001.md](TESTES_FET_MAIL_001.md). Testes F040 sem skips.

Comandos node --test individuais foram executados pelo runner F039:
`node tests/runWithReplicaSet.js --test tests/ARQUIVO.test.js`, cwd ecommerce.
É o mesmo Node test runner, acrescido da identidade/banco temporário obrigatório;
não afrouxamos a recusa de URI externa para executar comandos fora do contexto.

| Validação | Resultado final |
| --- | --- |
| emailOutbox.test.js | 26/26 |
| emailWorker.test.js | 36/36 |
| emailTemplates.test.js | 25/25 |
| emailOutboxAudit.test.js | 20/20 |
| API npm.cmd test --prefix ecommerce | 1755 casos; 1740 aprovados; 15 skips F024; zero falhas |
| Build npm.cmd run build --prefix ecommerce/frontend | Aprovado, exit 0 |
| E2E focado emailOutbox.spec.js | 1/1, zero skips |
| E2E completo | 60/60 aprovados, zero skips/retries |
| Commercial Gate | Aprovado, exit 0: repo-safety/architecture/API/build/E2E/audit; API 1755/15 skips F024 e E2E 60/60 |
| git diff --check / arquivos novos | Aprovado; 19 arquivos novos conferidos (whitespace/UTF-8) |
| npm audit backend | Exit 0; zero vulnerabilidades |
| npm audit frontend | Exit 0; zero vulnerabilidades |

Somente os 15 skips conhecidos F024, exclusivamente Database Tools
mongodump/mongorestore ausentes. Nenhum download, restore drill ou skip F040.
Enforcement remoto F039 não validado; sem push/execução remota.

E2E integra a nova fixture preservando/restaurando apenas o bucket de cadastro
do banco temporário; não muda a política F008 nem consome a cota dos demais
testes. O worker processa batches limitados até alcançar o evento esperado na
fila compartilhada. Essas interferências foram detectadas na primeira rodada e
corrigidas antes das duas rodadas completas aprovadas (E2E e Commercial Gate).
Caches npm usadas dentro do workspace; nenhum lock/dependência foi atualizado.

## Probes pós-correção — fixtures temporárias

Banco do probe: `fetech_routes_auth_28252_1791864676007`, criado pelo runner em
replica set/porta dinâmica, removido no teardown. Resultados observados:

| Probe | Observado |
| --- | --- |
| Order/replay | Commit, mesmo Order, um ORDER_CREATED, zero provider durante request |
| Worker normal | SENT; uma mensagem por pedido |
| SMTP fake indisponível | RETRY; Order permanece |
| Concorrência | Duas conexões/processos: um claim/send normal (teste permanente) |
| Lease após crash | Recuperada com token novo; owner antigo não envia; SENT |
| Falha após send antes de SENT | PROCESSING recuperado; duas mensagens demonstradas para um evento; exatamente-once SMTP false |
| ANONYMIZED | SUPPRESSED, zero chamadas ao provider |
| Forgot/reset | Zero eventos de reset; outbox unchanged; F009 direto com fake |
| Audit | READ_ONLY, zero writes/provider; stale lease, DEAD e pending anonymized detectados |

Sem banco fetech, SMTP real, Cloudinary real, config.env alterado ou índices
comerciais aplicados **durante esta retomada**. A operação local separada de
12/10 provisionou dois índices de mídia para iniciar a API, autorizada pelo
pedido de execução; não foi teste/migração/envio F040 nem validação de produção.
Testes/CLIs desta tarefa usaram exclusivamente bases temporárias.

## Findings preservados e limites

F002/F003/F004/F005/F006/F007/F008/F009/F010/F011/F012/F013/F014/F015/F016/
F017/F018/F019/F020/F021/F025/F031/F036 continuam corrigidos. F022/F037
continuam corrigidos no código (rollout comercial de índices é outra operação).
F030 continua baseline técnico. F039 no código, validação remota pendente.
F024 **PARCIAL**, F026 **PARCIAL**, F029 **ABERTO**, F001/F027 **ADIADOS E NÃO
INICIADOS**. F023/infraestrutura produtiva permanece independente desta task.

Riscos residuais: provider real não validado; ausência de exactly-once externo;
crash/timeout após aceite pode duplicar; mudança de privacidade após a última
checagem não é commit atômico com SMTP; retenção indefinida/dead letters exigem
política operacional; restore drill F024 pendente; políticas legais F029 pendentes.
Nenhuma afirmação de conformidade jurídica ou envio real bem-sucedido.

Próxima recomendação: inventariar P2/P3 ainda abertos e avaliar F033
(acessibilidade/navegação por teclado) ou SEO/performance conforme plano atual.
Não iniciar automaticamente; pagamento/frete continuam adiados.
