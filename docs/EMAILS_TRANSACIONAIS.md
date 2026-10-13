# E-mails transacionais F040

## Inventário anterior à implementação — 09/10/2026

Branch main, HEAD 613f18b, worktree limpo; F030 commitada.

| Fluxo | Trigger | Implementação/provider | Síncrono | Durável |
|---|---|---|---|---|
| Password forgot | POST password/forgot, conta elegível | userController → utils/sendEmail → Nodemailer SMTP | sim | não; apenas hash/expire de reset em User |
| Registration | POST register | nenhum email | não se aplica | não |
| Order criado | commit F003/F004/F005 | nenhum email | não se aplica | não |
| Deactivate/reactivate | F016/adminSafety | nenhum email | não se aplica | não |
| Privacy request | F030/privacyService | nenhum email | não se aplica | não |

Configuração factual F036: HOST, PORTEMAIL, USER, PASSWORD, EMAIL_SECURE;
from é USER. FRONTEND_URL validado constrói links. Não duplicar com SMTP_*.
SMTP completo obrigatório em production; opcional em development/test.
Startup atual: initializeConfig, app/providers, Mongo, transações, prepare,
listen. Não há worker ou shutdown de polling existente.

O gap é ausência de evento comercial durável, não uma falha fabricada de SMTP
em checkout: checkout nunca enviava email. Reset permanece exceção síncrona,
resposta uniforme/timing floor/cleanup F009, sem token/link secreto no outbox.

## Implementação final — FET-MAIL-001 / F040

Os eventos `ACCOUNT_REGISTERED`, `ORDER_CREATED`, `ACCOUNT_DEACTIVATED`,
`ACCOUNT_REACTIVATED` e `PRIVACY_REQUEST_CREATED` são gravados em `EmailOutbox`
na mesma transação MongoDB da alteração de domínio. Falha no enqueue aborta a
transação. Replay F005 retorna o pedido existente e não cria outro evento.
Mudanças de lifecycle usam a versão da sessão para distinguir transições reais;
repetir a operação sem mudar o estado não gera nova notificação. Não há eventos
de pagamento, envio, marketing ou conclusão da anonimização.

Schema: schemaVersion, eventType, entityType/entityId, recipientUserId, dedupeKey,
status, attempts, nextAttemptAt, leaseToken/leaseExpiresAt, lastErrorCode,
providerMessageId (hash SHA-256), requestId, sentAt/suppressedAt e timestamps.
`dedupeKey` é única; índices compostos atendem status/data/prioridade e leases.
Sem TTL. Não armazena destinatário email, nome, subject, texto, HTML, payload,
senha, link/token de reset ou resposta bruta do provider. Schema estrito rejeita
campos desconhecidos. ObjectIds continuam pseudônimos, não dados anônimos.

## Worker e recuperação

Claim usa `findOneAndUpdate` atômico, lease UUID e expiração de 60 segundos.
Uma lease válida não pode ser tomada por outro worker; expiradas podem ser
recuperadas. Finalização exige token atual e lease ainda válida. Garantia no
MongoDB, sem mutex local ou Redis; duas conexões/processos são testados.

Estados: `PENDING → PROCESSING → SENT / RETRY / DEAD / SUPPRESSED`.
Falha transitória gera RETRY com backoff de 1 min, 5 min, 30 min, 2 h e 12 h.
Máximo de 6 tentativas, incluindo claims interrompidos por crash. Rejeição SMTP
permanente ou template inválido produz DEAD; não existe retry automático infinito.
Última lease expirada com tentativas esgotadas também vira DEAD. Não apagar
dead letters nem recriar eventos manualmente sem análise operacional.

Batch de 10, envio sequencial, polling de 5 segundos e shutdown com espera
limitada a 5 segundos; não inicia novos claims após stop. Leases não concluídas
permanecem recuperáveis. Worker automático só inicia no servidor com SMTP
configurado; NODE_ENV=test e desenvolvimento sem SMTP não abrem rede.

Destinatário é resolvido no User atual no instante de envio. User inexistente,
email inválido ou User ANONYMIZED gera SUPPRESSED sem buscar email histórico em
Order. User DEACTIVATED continua elegível para a notificação de desativação.
O worker revalida usuário e lease antes de I/O; mudança concorrente após essa
última leitura continua sendo uma janela entre MongoDB e SMTP.

## Provider e templates

`services/email/emailProvider.js` seleciona o adapter SMTP. Apenas
`smtpEmailProvider.js` cria transporte Nodemailer, de modo lazy, com timeouts
de conexão/greeting/socket (10/10/20 segundos). Nenhum transporte ao importar
módulos. Controllers comerciais não chamam SMTP. Nos testes, provider fake
injetado; nenhum código produtivo importa fake.

Templates server-side possuem text e HTML com escaping. Não interpolam nome,
endereço ou email; links usam FRONTEND_URL validado, nunca Host/Origin da request.
ORDER_CREATED lê o total histórico em centavos do Order e apenas confirma
recebimento. Não afirma pagamento confirmado, envio ou rastreamento. Não há pixel
de tracking. SMTP USER define remetente; nenhuma nova família SMTP_* foi criada.

## Semântica de entrega

Criação do evento é idempotente/exactly-once por dedupeKey e commit de domínio.
Entrega SMTP é **at-least-once/best-effort com tentativas limitadas**, sem garantia
de exactly-once ou de recebimento na caixa de entrada. SENT significa aceitação
pelo adapter/provider, não comprovação de leitura/entrega final.

Crash antes do provider: lease expira e outro worker retoma. Provider aceitou,
mas houve timeout ou falha/crash antes de persistir SENT: estado é ambíguo e o
retry pode enviar uma duplicata. `X-Fetech-Event-Id` identifica o evento; não é
promessa de deduplicação pelo SMTP. Falha de envio depois do commit não desfaz
Order, Stock, ledger ou evento. Não existe commit atômico entre MongoDB e SMTP.

## Exceção de recuperação de senha — F009

Forgot/reset permanece envio direto controlado pelo adapter: credencial efêmera
nunca entra no outbox. Preserva resposta genérica, timing floor, hashing,
expiração e remoção do token quando o envio falha. Não documentar esse envio
como evento comercial durável nem persistir link secreto para retries.

## Operação e auditoria

```powershell
npm.cmd run email:outbox:once --prefix ecommerce
npm.cmd run audit:email-outbox --prefix ecommerce
```

Primeiro comando é DRY_RUN por padrão: somente contagem técnica, sem provider,
transporte ou alterações. Envio requer intenção explícita e confirmação exata:

```powershell
npm.cmd run email:outbox:once --prefix ecommerce -- --apply --confirm-db NOME_EXATO_DO_BANCO
```

Não executar apply como parte de uma inspeção. Nesta tarefa, apply foi validado
exclusivamente em fixture temporária com provider fake. SMTP real não foi validado.
CLI não cria índices/coleções automaticamente e não aceita confirmação incorreta.

`audit:email-outbox` é READ_ONLY, sem argumentos, sem provider, sem autoCreate/
autoIndex e com snapshot de leitura. Detecta EMAIL_OUTBOX_STALE_PROCESSING,
EMAIL_OUTBOX_OVERDUE_RETRY, EMAIL_OUTBOX_DEAD, EMAIL_OUTBOX_INVALID_STATE,
EMAIL_OUTBOX_SENT_WITHOUT_SENT_AT, EMAIL_OUTBOX_PENDING_FOR_ANONYMIZED_USER,
EMAIL_OUTBOX_MISSING_RECIPIENT_USER e EMAIL_OUTBOX_FORBIDDEN_CONTENT.
DEAD/stale/overdue/anonimizado pendente são findings operacionais; demais
inconsistências são de integridade. IDs históricos são validados antes de lookup,
sem transformar objetos malformados em operadores de query. Sem reparo/apply.
Saída contém apenas resumo, categoria, tipo e outboxId seguro; nunca email/body.

Logs `email.outbox.enqueued/sent/retry/dead/suppressed/worker_failed` contêm IDs,
tipo de evento, tentativa e códigos enumerados. Não incluem destinatário, texto,
senha, erro bruto ou resposta SMTP. requestId original é preservado. Send/retry
não cria AdministrativeAuditEvent; mutações administrativas mantêm sua trilha F025.

## Limites e validação

Retenção é **UNDEFINED**, sem inventar prazo legal. Registry classifica
EmailOutbox.recipientUserId como PSEUDONYMOUS_IDENTIFIER. F030 continua baseline
técnico; F029 aberto. F024/F026 parciais; F039 remoto não validado; F001/F027 adiados.
Sem provider real validado, TTL, painel de outbox, reenvio manual ou migração
comercial nesta retomada. Testes usam bancos temporários em portas dinâmicas,
isolados pelo runner F039; comandos node --test individuais devem ser executados
dentro desse runner, preservando a recusa de URI comercial/externa.

Evidências e resultados: [RELATORIO_FET_MAIL_001.md](RELATORIO_FET_MAIL_001.md).
Lista individual: [TESTES_FET_MAIL_001.md](TESTES_FET_MAIL_001.md).
