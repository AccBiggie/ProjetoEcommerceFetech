# Relatório FET-DATA-003 — Lifecycle seguro de User

## Resultado

**CONCLUÍDO — F016 CORRIGIDO NO CÓDIGO.** Conta preservada, acesso revogado e referências históricas mantidas. Não é declaração de reparo de dados históricos nem de produção integralmente pronta.

## Branch, HEAD inicial/final e worktree

Branch main. HEAD inicial e final: bf2e4f92d5549fa259d5ada4662067c51c937157. Worktree inicial limpo; F025/FET-OPS-002 já commitada em bf2e4f9. Nenhuma alteração anterior descartada, nenhum reset/clean/push. Esta tarefa permanece **sem commit**; HEAD final não mudou.

## Finding tratado, reprodução anterior e causa raiz

F016: DELETE administrativo chamava adminSafety.deleteUser e User.deleteOne, removendo a identidade sem política referencial. Probe antes de editar código, em database temporária: HTTP 200; User depois existe=false; Address mantido=1, referência não resolve. Order/Review/outras referências não foram criadas nesse probe inicial; seus caminhos foram inventariados no código e comprovados no probe pós-correção/testes. Nenhuma observação foi atribuída ao banco comercial.

## Inventário real de referências a User

| Model/estrutura | Campo | Contrato após desativação |
| --- | --- | --- |
| Address | user | Obrigatória; mantida e resolvida |
| Order | user | Obrigatória; pedido/snapshot mantidos |
| OrderIdempotency | user | Obrigatória; claim/replay mantidos |
| Product.reviews[] | user | Obrigatória; review mantida |
| Product | user | Referência existente mantida; ausência histórica opcional pelo schema atual |
| AdminAuditEvent | actorUserId | Ator histórico preservado |
| Order | administrativeArchivedBy | Opcional quando não arquivado; ator existente preservado |
| User | deactivatedBy | Nova metadata; null em ACTIVE, admin em nova desativação |
| AdminMutationLock | bootstrapUserId | Reserva futura de ID, ausência não implica órfão |
| AdminAuditEvent | targetId com targetType USER | ID histórico polimórfico, inclusive eventos antigos USER_DELETED; não reescrito |

StockMovement referencia Order/Product. Category referencia Category. Rate limiter usa identidade derivada sem FK User; JWT/ALS/logs são IDs técnicos, não referências obrigatórias persistentes. [Inventário e decisões](LIFECYCLE_USUARIOS.md).

## Estratégia e User lifecycle

Nenhum hard delete/cascade. Default ACTIVE; DEACTIVATED bloqueia acesso. Legacy sem campo é ACTIVE, sem migration; null/status desconhecido falha fechado e é identificado pela auditoria. deactivatedAt/by controlados pelo servidor. Registro, perfil e edição comum ignoram injeção desses campos. Serviço específico integra F010, revogação e audit F025. UI usa status/filtros; CLI referencial é somente leitura.

## Deactivation contract

PATCH /api/v1/admin/user/:id/deactivate, admin ACTIVE e CSRF. 200 com DTO admin; grava DEACTIVATED, Date do servidor, deactivatedBy executor, tokenVersion +1 e unset dos campos de reset. A mesma transaction grava USER_DEACTIVATED. Segunda chamada 200/no-op, sem alterar timestamp/ator/versão nem duplicar evento. Visitante 401, user 403, CSRF 403, alvo inexistente 404, ID inválido 400, conflito 409. Não emite JWT/cookie; no-store/Request ID.

## Reactivation contract

PATCH /api/v1/admin/user/:id/reactivate, mesmas permissões. 200; ACTIVE, deactivatedAt/by null, tokenVersion mantido e evento USER_REACTIVATED. Ativo recebe 200/no-op. Não emite sessão, não troca senha nem revive JWT antigo. Login novo usa a senha atual e a versão vigente.

## DELETE legado e proteção física

DELETE /api/v1/admin/user/:id retorna 405 Allow: PATCH, “Usuários não podem ser excluídos fisicamente.” Sem desativação ou efeito comercial, inclusive para alvo válido inexistente após autorização. Model bloqueia findOneAndDelete/findByIdAndDelete/deleteOne/deleteMany/document.deleteOne, APIs legadas quando disponíveis, replaceOne/findOneAndReplace, bulk deletes/replaces e aggregate output. Erro USER_PHYSICAL_DELETE_FORBIDDEN. Collection do model também protege deletes/replaces/bulk quando middleware é desabilitado. Sem env/flag de bypass.

Seed não ganhou exclusão de User nem bypass. Test fixtures limpam pelo driver cru somente na database temporária identificada por runner/nome/PID. dropDatabase isolado continua funcionando e tem teste explícito. Guardas de model não protegem contra shell/driver/restore com credenciais privilegiadas.

## Auth integration

Middleware valida status e tokenVersion persistidos. Cookie anterior retorna 401; token fabricado com versão atual de conta inativa também 401. Login inválido/inativo usa erro genérico idêntico, sem cookie, com limiter F008. Revalidação após comparação de senha impede emissão após desativação durante comparePassword. Saves de senha e perfil usam condições de status/versão; revogações concorrentes não são desfeitas. Respostas privadas/erros auth/recovery/limiter recebem no-store; JWT continua fora do JSON.

## Password recovery

Forgot de inativo: 200 uniforme, nenhum token/email, piso F009 preservado (20 ms nas fixtures, configuração operacional existente preservada). Reset anterior é removido ao desativar e não reativa nem autentica. Mesmo token injetado em fixture DEACTIVATED é recusado. Saves atrasados de forgot/reset perdem CAS após desativação, sem restaurar token/versão/senha. SMTP lento ainda pode exceder o piso; F040/outbox não foi iniciado.

## F010 integration

Administrador operacional: role admin + ACTIVE ou legacy missing. Auto-desativação/autorrebaixamento 403; última redução operacional 409 na invariante, preservando precedência da regra própria 403. Admin inativo não conta. Fencing compartilhado inclui também admins inativos para proteger reativação/concorrência; executor é recarregado após adquirir lock. Corridas deactivate/deactivate e deactivate/demote mantêm um admin ACTIVE. Bootstrap **serviço e CLI** contam somente ativos: zero permite criar novo admin, nunca reativa antigo silenciosamente. Confirmação exata da database, entrada oculta, bcrypt, recusa de email existente e ausência de default/argv de senha permanecem.

## Integridade referencial e dados removidos

Address, Order, reviews, OrderIdempotency, eventos antigos, archive actor, Product.user e novo User.deactivatedBy resolvem para documentos User preservados. Snapshots BSON completos comparados antes/depois demonstram centavos, entrega, pagamento, inventoryStatus, Stock, StockMovement, claims, arquivo e reviews inalterados. Admin histórico desativado continua resolvendo ator de audit e administrativeArchivedBy.

**NENHUM documento dependente removido.** Única limpeza intencional no User: resetPasswordToken/resetPasswordExpire na desativação. Avatar/Cloudinary, email, nome e hash permanecem; não houve exclusão de mídia. Email permanece único/reservado.

## Privacy

PII anonimizada: **NÃO — F030 continua aberto.** Desativação não é erasure ou política de retenção. Serializer público não expõe deactivatedBy/at/fence, senha ou reset token; DTO admin inclui metadata técnica autorizada sem populate. Reativação volta a aceitar a senha atual, explicitada no diálogo/documentação.

## Audit F025

USER_DEACTIVATED e USER_REACTIVATED com targetType USER, actor/target server-side, metadata fromStatus/toStatus. Request ID do response/log/audit coincidem. Falha de insert aborta transição, versão e recuperação; testes cobrem ambos os sentidos. Proibições e no-ops não geram sucesso duplicado. Sem PII, senha, JWT ou token de recuperação no evento/log. USER_DELETED permanece no enum apenas por compatibilidade histórica.

## Admin frontend

Ação de excluir usuário removida. Botões Desativar conta/Reativar conta com confirmação e descrição de preservação/acesso. Própria conta tem ação desabilitada. Badges Ativo/Desativado; estado desconhecido sinalizado e ação bloqueada. Filtros Ativos (padrão), Desativados, Todos. Detalhe de inativo permitido ao admin. Interceptor de respostas 401 limpa Redux e rotas protegidas encaminham ao login, sem polling. E2E usa dois contextos reais e comprova próxima request 401, novo login e eventos na aba Auditoria.

## Audit referencial

backend/scripts/auditUserReferences.js; comando npm.cmd run audit:users --prefix ecommerce. **READ-ONLY**; perfil users-audit valida NODE_ENV/DB_URI, sem secrets de HTTP/SMTP/Cloudinary, flags ou autoCreate/autoIndex. Categorias: ORPHAN_USER_REFERENCE, INVALID_USER_REFERENCE, INVALID_ACCOUNT_STATUS, INVALID_LIFECYCLE_METADATA. Projeções/cursors técnicos, ObjectIds/relação/missingTargetType User e contagens; valor inválido e PII não são impressos. Campos opcionais ausentes/reserva bootstrap não viram falso órfão. Utilitário e CLI real executados somente em database temporária: zero inconsistências no probe íntegro. Testes com órfãos sintéticos detectam cada relação e comprovam ausência de writes/snapshots inalterados.

Banco comercial: **NÃO**. Sem recriar User, reparar refs, migrar ou remover dependentes. Órfãos preexistentes ainda exigem auditoria e decisão posterior; reparo real depende de F024 validado. Custo de consulta cresce com referências, performance produtiva F022.

## Arquivos criados

- docs/LIFECYCLE_USUARIOS.md
- docs/RELATORIO_FET_DATA_003.md
- docs/TESTES_FET_DATA_003.md
- ecommerce/backend/scripts/auditUserReferences.js
- ecommerce/backend/utils/userLifecycle.js
- ecommerce/backend/utils/userReferenceAudit.js
- ecommerce/tests/e2e/userLifecycle.spec.js
- ecommerce/tests/helpers/userFixtureCleanup.js
- ecommerce/tests/userLifecycle.test.js
- ecommerce/tests/userReferenceAudit.test.js

## Arquivos alterados

- ROTAS.md
- docs/ADMINISTRACAO.md
- docs/AUTENTICACAO.md
- docs/CONFIGURACAO.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/OBSERVABILIDADE.md
- docs/PLANO_MELHORIAS_FETECH.md
- ecommerce/backend/config/runtimeConfig.js
- ecommerce/backend/controllers/userController.js
- ecommerce/backend/middleware/auth.js
- ecommerce/backend/models/userModel.js
- ecommerce/backend/observability/auditContract.js
- ecommerce/backend/routes/userRoutes.js
- ecommerce/backend/scripts/bootstrapAdmin.js
- ecommerce/backend/services/adminSafetyService.js
- ecommerce/backend/utils/authSession.js
- ecommerce/backend/utils/jwtToken.js
- ecommerce/frontend/src/component/Admin/Dashboard.jsx
- ecommerce/frontend/src/utils/httpClient.js
- ecommerce/package.json
- ecommerce/tests/adminAudit.test.js
- ecommerce/tests/adminSafety.test.js
- ecommerce/tests/api.test.js
- ecommerce/tests/auth.test.js
- ecommerce/tests/authCookieSecurity.test.js
- ecommerce/tests/configSecurity.test.js
- ecommerce/tests/e2e/routes.spec.js
- ecommerce/tests/e2e/server.js
- ecommerce/tests/httpSecurity.test.js
- ecommerce/tests/orderHistory.test.js
- ecommerce/tests/privateResponseSecurity.test.js

## Dependências e npm audit

Dependências adicionadas: **NENHUMA**. package.json alterado somente para audit:users; ambos os lockfiles e árvores de dependência preservados. npm audit: **NÃO executado**, sem alteração de dependências; não houve npm audit fix, download/instalação ou nova variável de ambiente.

## Testes adicionados e focused tests

Lista individual dos 96 casos e do fluxo E2E, com mapeamento dos 90 requisitos: [TESTES_FET_DATA_003.md](TESTES_FET_DATA_003.md). Execução direta: node --test ecommerce/tests/userLifecycle.test.js ecommerce/tests/userReferenceAudit.test.js. **96/96**, sem skips (77 lifecycle, 19 referencial). Cada arquivo inicia seu próprio replica set se o runner não fornecer um. Regressão inicial auth/admin/audit 126/126; após revisão do CLI foi repetida a validação completa. Testes existentes de delete foram adaptados para manter assertivas de preservação/revogação/fencing/rollback; nenhum teste de segurança foi removido.

## API completa e skips F024

npm.cmd test --prefix ecommerce: **933 total, 918 aprovados, 0 falhas, 15 skips**. Os 15 continuam exclusivamente ligados a mongodump/mongorestore ausentes; lista nominal no documento de testes. Nenhum skip novo de lifecycle, segurança, pedido ou observabilidade.

## Build, E2E e diff

npm.cmd run build --prefix ecommerce/frontend: **APROVADO**. npm.cmd run test:e2e --prefix ecommerce: **32/32 APROVADOS**. git -c core.safecrlf=false diff --check: **APROVADO**, incluindo inspeção de whitespace dos arquivos novos. Ordem final focused → API → build → E2E → diff.

O primeiro E2E teve 31 pass e um teste novo com 429 por quota global de cadastros compartilhada. A fixture foi movida para conta dedicada criada no servidor isolado, sem elevar/desativar limiter. Smokes seguintes identificaram suposições do teste sobre destino/sincronização do login; ele passou a usar redirect=/account, aguardar resposta POST e comparar pathname, conforme contrato existente. Nenhuma mudança de comportamento do login para atender ao teste. Smoke final e suíte completa passaram.

## Probes pós-correção

| Verificação | Resultado observado |
| --- | --- |
| User permanece | SIM |
| Address.user resolve | SIM |
| Order.user resolve | SIM |
| Review.user resolve | SIM |
| OrderIdempotency.user resolve | SIM |
| DELETE HTTP | 405 |
| Model physical delete | USER_PHYSICAL_DELETE_FORBIDDEN |
| JWT anterior | 401 |
| JWT anterior após reativação | 401 |
| Novo login | 200 |
| Request ID abreviado | dc78f795... |
| Log e audit correlacionados | SIM |
| CLI real temporário | READ_ONLY, 0 issues |

Último admin: UL-19/20/21 e AS invariantes aprovados; self-action 403, ensureAnotherAdmin 409 com apenas um ativo e outro inativo. Concorrência: UL-22/23 e AS-10..12/34..36 aprovados, nunca zero ativos; execuções em conexões independentes e fencing preservados. Resultados descritos são probes/testes reais em fixtures, não afirmações sobre produção.

## Banco utilizado e ambiente preservado

Replica sets mongod local temporários, bind 127.0.0.1 e portas dinâmicas; databases fetech_routes_auth_PID_timestamp, fetech_lifecycle_drop_PID_timestamp e demais namespaces próprios dos testes/E2E. Teardown restrito remove databases/diretórios pertencentes à execução. CLI de auditoria no probe herdou DB_URI temporária do harness, nunca a URI comercial de config.env.

**BANCO REAL NÃO ALTERADO.** Não houve conexão/probe/audit/migration/restore/reconfiguração no MongoDB comercial. config.env/secrets reais não foram sobrescritos. Histórico de auditoria e relatórios anteriores não foram alterados. Nenhuma ferramenta MongoDB Database Tools foi baixada.

## Findings anteriores preservados

| Finding | Situação e evidência |
| --- | --- |
| F002 | CONTINUA CORRIGIDO — gate de envio sem pagamento, state machine/E2E |
| F003 | CONTINUA CORRIGIDO — reserva/estoque transacional |
| F004 | CONTINUA CORRIGIDO — rollback/concurrency do estoque |
| F005 | CONTINUA CORRIGIDO — idempotência persistente/replay |
| F006 | CONTINUA CORRIGIDO — JWT revogável e CAS |
| F007 | CONTINUA CORRIGIDO — política de cookie |
| F008 | CONTINUA CORRIGIDO — limiter distribuído, inclusive login inativo |
| F009 | CONTINUA CORRIGIDO — forgot uniforme/piso |
| F010 | CONTINUA CORRIGIDO — admins ACTIVE, lock/fencing e CLI |
| F011 | CONTINUA CORRIGIDO — arquivo/proibição de delete de Order |
| F012 | CONTINUA CORRIGIDO — snapshot de entrega íntegro |
| F013 | CONTINUA CORRIGIDO — quantidade/checkout estritos |
| F014 | CONTINUA CORRIGIDO — centavos exatos |
| F020 | CONTINUA CORRIGIDO — Helmet/CSP/CSRF/Origin |
| F021 | CONTINUA CORRIGIDO — JWT fora do JSON/no-store |
| F025 | CONTINUA CORRIGIDO — Request ID/log/audit atômico |
| F036 | CONTINUA CORRIGIDO — config central/fail-fast |
| F024 | CONTINUA PARCIAL — drill real depende de MongoDB Database Tools |

## Findings adiados e relacionados abertos

**F001 pagamento e F027 frete: NÃO INICIADOS.** F030 privacy/retention/anonymization/direitos do titular permanece aberto. F015 reviews concorrentes, F017 categorias concorrentes, F018/F019 uploads/avatar, F022 performance/paginação, F023 deployment, F028 pós-venda, F029 integrações reais, F031 storage corrompido e demais findings sem remediação específica permanecem abertos. Esta task não os declara corrigidos.

## Documentação e auditoria histórica

Criados LIFECYCLE_USUARIOS, relatório e testes individuais; atualizados AUTENTICACAO, ADMINISTRACAO, ROTAS da raiz, OBSERVABILIDADE, CONFIGURACAO, ESTADO_ATUAL e PLANO. **Auditoria histórica original NÃO ALTERADA.** Relatórios anteriores mantêm os resultados e findings de seu momento; o status atual é registrado em novos documentos/seções.

## Compatibilidade e escopo

Clients administrativos devem substituir DELETE por PATCH deactivate/reactivate; DELETE 405 não desativa. User permanece e email não é liberado. Login de desativado falha genericamente; lista admin padrão passa a ACTIVE. Legacy não exige migration. Nenhuma alteração fora de escopo: headers no-store de falhas auth/recovery completam o contrato verificado no lifecycle; conta dedicada E2E preserva as quotas existentes. Não houve deploy, ferramenta externa, pagamento, frete, privacy erasure ou reparo comercial.

## Riscos residuais e status

PII/hash/avatar/addresses permanecem armazenados enquanto desativado (F030). Reativar permite a senha atual. Guardas não substituem permissões Mongo. Requisições autorizadas antes da desativação podem já estar em andamento; não há cancelamento global. Fencing pode avançar mesmo se transição/audit abortar, como no contrato F010/F025 anterior; metadata comercial/sessão é revertida. Órfãos históricos não reparados, backup/restore real pendente F024; mídia/avatar continuam F018/F019. Pagamento/frete adiados.

**F016: CORRIGIDO NO CÓDIGO** para eliminar exclusão física e novos órfãos por esse caminho, com deactivation/reactivation e testes permanentes. Não é anonimização nem garantia contra mudanças privilegiadas no banco.

## Próxima task recomendada

**F015 — corrigir agregação concorrente de avaliações/reviews, garantindo rating e número de reviews consistentes sob creates/updates/deletes simultâneos.** Não iniciada automaticamente. F001/F027 permanecem adiados; F024 parcial. Aguardar instrução do usuário.
