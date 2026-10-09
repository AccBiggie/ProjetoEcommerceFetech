# Privacidade e retenção — inventário técnico F030

Este documento define controles técnicos; não certifica conformidade jurídica.
ObjectIds e hashes correlacionáveis são identificadores pseudônimos, não dados
anônimos. RETENTION_PERIOD = **UNDEFINED** quando não há decisão formal do
negócio/jurídico. Janelas de segurança existentes são parâmetros técnicos, não
prazos legais. O banco comercial não é utilizado nesta implementação.

## Inventário factual anterior à implementação

| Store/Model | Campo | PII? | Categoria | Autoridade | Retenção técnica atual |
|---|---|---:|---|---|---|
| User | name | sim | DIRECT_PII | perfil autenticado/admin | mantém inclusive DEACTIVATED |
| User | email | sim | CONTACT_PII | conta/unique index | mantém inclusive DEACTIVATED |
| User | password, resetPasswordToken/Expire, tokenVersion | sim/segurança | SECURITY_CREDENTIAL | auth/model | hash bcrypt; reset expira; sem expurgo de conta |
| User | avatar.public_id/url, avatarRevision | sim | DIRECT_PII/PSEUDONYMOUS_IDENTIFIER | media F019 | vínculo persistente; cleanup durável |
| User | _id, deactivatedBy, role/accountStatus, createdAt, adminMutationFence | pseudônimo/metadata | PSEUDONYMOUS_IDENTIFIER/TECHNICAL_METADATA | F016/F010 | User não pode ser excluído fisicamente |
| Address | recipientName, address, number, complement, neighborhood, city, state, country, pinCode, phoneNo, label | sim | SHIPPING_PII/CONTACT_PII | catálogo de endereços privado F012 | mantém após desativação |
| Address | user, favorite, timestamps | pseudônimo/metadata | PSEUDONYMOUS_IDENTIFIER/TECHNICAL_METADATA | owner | sem retenção definida |
| Order | shippingInfo.* (mesmos campos, legados incluídos) | sim | SHIPPING_PII + COMMERCIAL_HISTORY | snapshot comercial F012 | preservado; UNDEFINED |
| Order | user, archive actor, IDs/hash de intenção, paymentInfo, itens/centavos/status, timestamps | pseudônimo/histórico | COMMERCIAL_HISTORY/PSEUDONYMOUS_IDENTIFIER | F002–F014 | sem physical delete; UNDEFINED |
| Product | reviews.name | sim | DIRECT_PII | snapshot do autor F015 | persistente |
| Product | reviews.user/_id, rating, comment | pseudônimo/conteúdo | PUBLIC_USER_CONTENT/PSEUDONYMOUS_IDENTIFIER | F015 | persistente; free-text pode conter PII |
| Product | user, images, descrição/catálogo | pseudônimo/conteúdo | PSEUDONYMOUS_IDENTIFIER/PUBLIC_USER_CONTENT | catálogo F037 | histórico técnico, sem expurgo automático |
| AdminAuditEvent | actorUserId, targetId, requestId, action, metadata allowlisted | pseudônimo | ADMIN_AUDIT | F025 admin append-only | preservado, UNDEFINED |
| AuthRateLimit | _id HMAC(scope + conta/IP), scope/count/pending/windowStartedAt/expiresAt | pseudônimo | SECURITY_EPHEMERAL | F008 | TTL expiresAt, expireAfterSeconds=0 |
| OrderIdempotency | user, keyHash/requestHash, order/status/timestamps | pseudônimo | COMMERCIAL_HISTORY/SECURITY_CREDENTIAL | F005 | preservado; key raw não armazenada |
| StockMovement | actorUserId/product/order, reason/type/quantidades/version/createdAt | pseudônimo/histórico | COMMERCIAL_HISTORY | F003/F037 | ledger preservado, UNDEFINED |
| MediaUploadIntent | user/publicId, provider/kind/status/revision/codes/timestamps | pseudônimo | PSEUDONYMOUS_IDENTIFIER/TECHNICAL_METADATA | F019 | lifecycle/reconcile; duração UNDEFINED |
| MediaCleanupTask | user/publicId, provider/status/reason/attempts/codes/timestamps | pseudônimo | PSEUDONYMOUS_IDENTIFIER/TECHNICAL_METADATA | F019 | durável, sem expurgo definido |
| AdminMutationLock | owner UUID, bootstrapUserId, fence/lease/timestamps | pseudônimo/metadata | SECURITY_EPHEMERAL/TECHNICAL_METADATA | F010 | singleton sem TTL; fence não pode reiniciar |
| Category/CategoryHierarchyState | name/key/parent/revision/timestamps | normalmente não | PUBLIC_USER_CONTENT/TECHNICAL_METADATA | F017 | sem PII direta prevista; texto livre residual |
| logs | IDs/role/requestId/route template/codes/duração | pseudônimo | ADMIN_AUDIT/TECHNICAL_METADATA | F025 logger/redactor | sem corpo/IP/email/URL bruta; destino/retention UNDEFINED |
| localStorage | shippingInfo | sim | SHIPPING_PII (draft local) | storageRegistry F031 | até remoção seletiva pelo usuário; não é cache de conta |
| localStorage | cartItems, fetech-color-mode | conteúdo/metadata | COMMERCIAL_HISTORY/TECHNICAL_METADATA | F031 | carrinho não é vinculado a User; tema factual |
| sessionStorage | fetech.orderAttempt.v1 | pseudônimo | COMMERCIAL_HISTORY | F005/F031 | tentativa incerta preservada; sem storage.clear |
| memória frontend | profile/auth/privacy | sim/estado privado | DIRECT_PII/TECHNICAL_METADATA | API autenticada | memória de sessão; sem cache persistente de perfil |

Address não é referenciado por Orders: o checkout cria snapshot independente.
Por isso, remover o catálogo pessoal durante anonimização não remove entrega
histórica. A auditoria histórica permanece íntegra. Não remover comentários de
reviews por regex; conteúdo pessoal livre exige moderação específica.

## Contrato implementado

`accountStatus` continua ACTIVE/DEACTIVATED. `privacyStatus` é NORMAL,
ANONYMIZATION_REQUESTED ou ANONYMIZED; ausência legada significa NORMAL sem
migration automática. A solicitação autenticada não desativa a conta, não
revoga sessões e pode ser cancelada antes da execução. Cancelar registra
CANCELLED e restaura NORMAL; solicitar novamente cria outra solicitação.

PrivacyRequest persiste somente User/ator, tipo ANONYMIZE_ACCOUNT, status,
datas e requestId. Não recebe nome, email, endereço, justificativa ou texto
livre. Índice parcial único `(user,type)` para REQUESTED impede duas solicitações
ativas. Transações e fencing de User resolvem criação/cancelamento concorrentes.
A fila administrativa usa page/limit F022, projeção mínima e lookup limitado.

Somente administrador autenticado pode executar, com corpo exato
`{"confirmation":"ANONIMIZAR <userId>"}`. A conta alvo precisa estar DEACTIVATED,
ser user e ter solicitação REQUESTED coerente. O lock Mongo compartilhado com
F010 coordena promoção, desativação e reativação entre instâncias. Todos os
efeitos persistidos, inclusive USER_ANONYMIZED em AdminAuditEvent, participam
da mesma transação snapshot/majority. Erros causam rollback integral. Repetir
a execução concluída retorna applied=false sem novo alias, auditoria ou destroy.

| Grupo | Efeito ao anonimizar | O que permanece | RETENTION_PERIOD |
|---|---|---|---|
| User direto/contato | nome `Usuário removido`, email `anon-<UUID>@privacy.invalid`, avatar padrão | _id, createdAt, metadata de desativação | UNDEFINED |
| Credenciais | senha aleatória desconhecida com bcrypt, tokenVersion incrementado, reset limpo | hash inutilizável para o titular e versão | UNDEFINED |
| Address pessoal | remoção transacional completa do catálogo do titular | endereços de terceiros | UNDEFINED |
| Reviews | substituição apenas do nome do titular | IDs, user, rating, comentário, contagem/média | UNDEFINED |
| Order/ledger/claims/audit anterior | preservação exata | shippingInfo, pagamento, centavos, itens, estoque, archive, hashes e relações | UNDEFINED |
| Avatar gerenciado | desvincula e cria obrigação durável F019 | task/intent técnicos; referências compartilhadas protegidas | UNDEFINED |
| Avatar legado/compartilhado | BLOCKED para revisão; não adivinha ownership | obrigação e código técnico | UNDEFINED |
| AuthRateLimit | preserva buckets ativos | HMAC, counters e TTL expiresAt existente | UNDEFINED; TTL é técnico |
| PrivacyRequest | conclui com ator/data | trilha mínima de estados | UNDEFINED |
| Storage frontend | nenhum cache de privacidade ou clear global | draft local, carrinho, tema e tentativa incerta F005 | UNDEFINED |

A conta anonimizada nunca autentica, redefine senha, reativa ou volta a admin.
F016 responde 409 USER_ANONYMIZED na reativação. Guardas no model rejeitam
restauração da PII por save/query/collection/bulk comercial. O driver nativo
administrativo permanece fora dessas guardas: acesso operacional exige controle
de permissões. Novo cadastro com email antigo cria novo _id, sem reatar histórico.
Address/review writes autenticados passam por fencing transacional de User,
revalidando sessão e nome atual; requisições atrasadas não restauram PII.

## Mídia, autenticação e auditoria

Provider nunca é chamado dentro da transação. Após commit, cleanup F019 é best
effort: falha externa mantém PENDING, referência compartilhada mantém BLOCKED,
asset não gerenciado exige revisão manual. A task durável permite reconcile já
existente; não há scheduler novo. Só testes usam provider/SMTP fake.

CSRF global F020, no-store F021, versão F006 e rate limiting F008 permanecem
obrigatórios. Solicitar/cancelar tem escopo privacy por conta HMAC, limite
técnico de cinco mutações por janela de uma hora. Não remover buckets ao
anonimizar. O evento administrativo USER_ANONYMIZED contém alvo e
metadata.privacyRequestId, sem confirmação, alias, PII antiga ou payload bruto.
Solicitação/cancelamento têm trilha durável em PrivacyRequest e não forjam
AdminAuditEvent para ator user, preservando o contrato estrito F025.

## Auditoria e operação

`npm.cmd run audit:privacy --prefix ecommerce` aceita configuração mínima
NODE_ENV/DB_URI no perfil privacy-audit F036. É exclusivamente leitura,
rejeita qualquer argumento (incluindo --apply) antes de conectar, usa snapshot
e cursores nativos com projeções, autoCreate=false/autoIndex=false. Não chama
provider nem inicializa índices. Saída: contagens, códigos e IDs pseudônimos;
sem nomes/emails/endereços/tokens/publicIds. Dados de entrega históricos são
contados como retenção, não tratados como corrupção ou apagados.

Detecções: ANONYMIZED_USER_WITH_REAL_EMAIL, ANONYMIZED_USER_WITH_REAL_NAME,
ANONYMIZED_USER_WITH_ADDRESS, ANONYMIZED_USER_REVIEW_NAME,
ANONYMIZED_USER_WITH_RESET_TOKEN, ANONYMIZED_USER_WITH_MANAGED_AVATAR,
ANONYMIZED_USER_ACTIVE, PRIVACY_REQUEST_INCONSISTENT e
EXPIRED_SECURITY_RATE_LIMIT_RECORD. Expiração detectada pode aguardar o monitor
TTL; não implica limpeza manual de buckets ativos. A auditoria não repara dados.

Rollout exige replica set/transações, backup/restore validado F024, revisão
prévia dos dados e dos índices. PrivacyRequest requer unique parcial e índices
de fila/latest; Product recebe `reviews.user` para contagem, auditoria e
anonimização seletiva. Nenhum índice foi aplicado ao banco comercial nesta task.
O serviço usa init no fluxo operacional da solicitação para garantir unique;
isso deve ser compatibilizado com as permissões e o plano de deploy.

Não há prazo legal inventado, certificação LGPD/GDPR, exportação ampla de PII,
apagamento de Order, purge automático ou retenção jurídica resolvida. Frete/
pagamento/provedores reais, conteúdo livre, backups e destinos de logs mantêm
necessidades de política e controles operacionais próprios. O frontend explica
solicitação versus execução, irreversibilidade e retenção comercial, sem promessa
de eliminação total. Evidências: [testes](TESTES_FET_PRIVACY_001.md) e
[relatório](RELATORIO_FET_PRIVACY_001.md).
