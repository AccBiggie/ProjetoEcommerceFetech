# Relatório FET-PRIVACY-001 — F030 — 09/10/2026

**CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO.** Solicitação durável, anonimização
irreversível e minimização de PII implementadas. Retenção formal permanece
UNDEFINED; shippingInfo histórica e relações comerciais continuam preservadas.
Esta entrega não certifica conformidade jurídica nem eliminação total.

## Estado inicial e escopo

main, HEAD 2d31aa2, worktree inicialmente limpo. F039 já commitada; F022/F037
e remediações anteriores presentes. Implementação atual sem commit/push.
Inventário factual realizado antes das alterações, incluindo models, logs,
payloads públicos/administrativos, storage F031 e snapshots comerciais.
[Inventário e matriz completos](PRIVACIDADE_E_RETENCAO.md).

Banco real fetech e seus índices não acessados para mutations/audits/migrations;
config.env, processos reais, Cloudinary/SMTP e auditoria histórica intocados.
MongoDB Server local 8.0.26 usado somente pelo runner isolado de testes.
Nenhum download Database Tools, dump/restore, audit fix ou alteração de locks.

## Implementação

- Eixo privacyStatus NORMAL/ANONYMIZATION_REQUESTED/ANONYMIZED independente
  de F016; legado ausente NORMAL, sem migration automática. User nunca é
  excluído fisicamente e ANONYMIZED não pode voltar a ativo/admin/PII direta.
- PrivacyRequest mínima, sem PII copiada/texto livre, unique parcial ativo e
  índices latest/fila. Request/cancel via auth/CSRF/limiter HMAC; pedir não
  desativa nem revoga sessão. Consulta de status/overview mínima.
- Fila admin paginada F022, eligibility e confirmação exata ANONIMIZAR userId.
  Alvo somente user desativado. Mongo lease compartilhado F010 e snapshot
  majority coordenam instâncias e concorrência; nenhum mutex local é autoridade
  da privacidade. Writes de Address/reviews fazem fencing transacional de User.
- Transação única para User tombstone, remoção Address, nome de review,
  PrivacyRequest COMPLETED, task F019 e evento append-only F025. Rollback integral
  quando qualquer participante falha. Replay sem novo efeito/audit/destroy.
- Nome canônico, UUID não derivado no email .invalid, bcrypt de senha desconhecida,
  reset limpo, tokenVersion revogado, avatar padrão; _id/createdAt preservados.
  JWT capturado/fabricado, login, forgot, reset e reativação não restauram conta.
  Novo registro com email antigo recebe identidade nova sem reatar histórico.
- Cleanup depois do commit e fora da transação. Falha externa PENDING;
  legacy unmanaged/referência compartilhada BLOCKED, sem adivinhar destroy.
- Order/StockMovement/OrderIdempotency/audit antigo não recebem mutation.
  Review preserva IDs/user/rating/comment/contagem/média, muda somente nome.
  Conteúdo livre pode conter PII e exige moderação específica.
- Registry técnico, audit:privacy read-only em snapshot/cursores, configuração
  mínima F036, sem provider/índice/autoCreate/apply. Logs/eventos sem PII antiga,
  alias, confirmação, senhas, reset ou resposta bruta. Buckets HMAC ativos
  preservados e TTL expiresAt existente mantido.
- Tela Privacidade do titular e fila admin com confirmação forte; nenhum cache
  persistente novo. Storage F031/carrinho/draft/tema e tentativa incerta F005
  preservados, sem clear genérico.

## Evidência factual antes/depois

Pré-fix test-first: um controle F016 aprovado e duas falhas (estado/endpoint
ausentes). Probe sintético confirmou DEACTIVATED ainda com perfil, Address,
Order, claim, review, audit e avatar. Pós-fix: request REQUESTED, tombstone
irreversível, catálogo removido, nome público anônimo, avatar desvinculado,
cleanup durável e USER_ANONYMIZED sem PII. Sentinelas antigas ausentes em User,
Address, review.name, logs e eventos; snapshots BSON comerciais/audit histórico
exatos. Order.shippingInfo **mantém PII histórica, prazo UNDEFINED**.
Essa exceção é intencional e não foi ocultada como full erasure.

## Validação

Focados finais 85/85, zero skips/todo; respostas privadas 35/35; browser focado
final 2/2. API preliminar 1616 aprovados/15 skips F024, build aprovado,
E2E preliminar 59/59 zero skips. Probe pós-fix exit 0.
API integral final no gate: **1633 aprovados + 15 skips F024 = 1648**, exit 0;
arquitetura **71/71**, build repetido aprovado em 587 ms.
**Commercial Gate final APROVADO, exit 0:** repo safety/diff, arquitetura 71/71,
API 1633 aprovados e 15 bloqueios F024 exclusivos, build aprovado, E2E final
59/59 com zero skips, npm audit backend/frontend ambos com zero vulnerabilidades.
Browser focado após teardown 2/2, exit 0. Sem retries ampliados ou supressões.
Todos os diretórios test-run desta execução foram removidos pelos runners;
processos reais Mongo/API/Vite mantidos. HEAD continua 2d31aa2, sem commit/push.
[Casos, comandos e evidências](TESTES_FET_PRIVACY_001.md).

## Arquivos e documentação

Models User/PrivacyRequest/MediaCleanupTask; privacyContract/privacyDataRegistry/
privacyAudit; privacyService/privacySensitiveWrite/privacyRoute/auditPrivacy;
auth, userLifecycle, adminSafety, Address/review writes; limiter/logger/audit
allowlists, runtimeConfig, manifesto reviews.user, script package.json.
Frontend routes/Profile/Dashboard/Privacy/PrivacyRequests. Tests privacyLifecycle,
privacyAnonymization, privacyAudit, privacyHarness, configSecurity, E2E fixtures/
privacy.spec. Nenhuma dependência/lock/workflow alterado.

Docs: PRIVACIDADE_E_RETENCAO, TESTES/RELATORIO_FET_PRIVACY_001,
LIFECYCLE_USUARIOS, AVATAR_E_MIDIA, REVIEWS_CONCORRENCIA, HISTORICO_PEDIDOS,
OBSERVABILIDADE, ROTAS, PAGINACAO_E_PERFORMANCE_API, CI_E_GATES_COMERCIAIS,
ESTADO_ATUAL_PROJETO_FETECH, PLANO_MELHORIAS_FETECH e COMANDOS.
**AUDITORIA HISTÓRICA NÃO ALTERADA. Alterações fora de escopo: NENHUMA.**

## Findings preservados e riscos residuais

- F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013,
  F014, F015, F016, F017, F018, F020, F021, F025, F031 e F036:
  **CONTINUAM CORRIGIDOS**.
- F019: **CONTINUA CORRIGIDO PARA NOVAS SUBSTITUIÇÕES**, integrado ao cleanup
  da anonimização; legados podem exigir revisão manual.
- F022/F037: **CONTINUAM CORRIGIDOS NO CÓDIGO**, índices comerciais pendentes;
  restore comprovado F024 é gate operacional. Novos índices de privacidade
  e reviews.user só criados/validados em bancos de teste nesta task.
- F024: **CONTINUA PARCIAL**, quinze skips exclusivos existentes;
  Database Tools/restore drill ainda não realizados.
- F026: **CONTINUA PARCIAL**; CI implementado no código, CD/target pendentes.
- F029: **CONTINUA ABERTO**; Cloudinary/SMTP reais não validados.
- F039: **CONTINUA CORRIGIDO NO CÓDIGO / VALIDAÇÃO REMOTA PENDENTE**;
  nenhum run remoto/push/branch protection aplicado ou verificado.
- F023: infraestrutura comercial continua necessária; F038 tuning de escala
  permanece residual. F001 pagamento/F027 frete: **ADIADOS, NÃO INICIADOS**.
- F030: **CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO**; prazos de retenção
  formais indefinidos, dados shipping históricos em Orders, comentários livres,
  backups/destinos de logs e revisão de mídia legada continuam riscos residuais.

## Próxima task recomendada

**F040 — emails transacionais confiáveis:** abstração do provider, eventos de
conta/pedido, fila/outbox persistente e retries seguros; nenhum SMTP dentro
de transactions. Integração real permanece F029 se SMTP não estiver disponível.
F001/F027 adiados e F024 parcial. **NÃO INICIADA AUTOMATICAMENTE.**
