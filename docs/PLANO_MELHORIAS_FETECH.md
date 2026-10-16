# Plano de melhorias Fetech
## F038 — FET-PERF-002 (13/10/2026)

Status: **CORRIGIDO NO CÓDIGO** — finding original “Imagem hero e chunks sem orçamento operacional”.
Baseline real/versionado, Hero WebP local de 88.358 bytes (-91,73%), initial JS
gzip 213.472 bytes (-3,16%), abas audit/privacy lazy, consultas só da aba ativa,
leituras pending deduplicadas com stale/abort guards e fallback de página com
h1 transitório sem roubar foco. Admin já era isolado da Home e continua assim.
Manifest/proveniência, auditor READ_ONLY e budget integrado a ci:build/Commercial
Gate. Nenhuma dependência nova, atualização de versão ou provider real.

Validação: focused 26/26 + thunks reais 6/6; browser performance 9/9;
arquitetura 144/144; API 1817 aprovados + 15 F024; E2E 84/84 sem
skips; axe F033, build/budget/Commercial Gate/diff/audits aprovados.
[Contrato](PERFORMANCE_FRONTEND.md), [testes](TESTES_FET_PERF_002.md),
[relatório](RELATORIO_FET_PERF_002.md).

Branch main, HEAD e6fcee5; worktree inicialmente limpo, F033 já commitada.
FET-PERF-002 sem commit/push. Banco fetech, SMTP, Cloudinary, índices e config.env
intocados. F024/F026 parciais, F029 aberto, F039 remoto pendente; F030/F033
baselines técnicos, F040 no código/SMTP não validado; F001/F027 não iniciados.
Índices F022/F037 pendentes. Referências históricas de custo de escala como F038
não significam remediação dessas queries. Lab não equivale a field CWV;
CDN/cache/compressão/deployment continuam F023. Próxima recomendação: inventário
SEO com URL/deployment/rotas indexáveis, sem início automático.
Este bloco corrente prevalece sobre recomendações históricas.
Intermitências UL observadas durante validação estão registradas no relatório;
causa não estabelecida, sem relaxar testes. A execução integral final passou.

## F033 — FET-A11Y-001 (13/10/2026)

Status: **CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO DE ACESSIBILIDADE**. Referência
WCAG 2.2 AA, sem certificação alegada. Main único persistente no layout, skip link,
headings/títulos/foco de rota, nomes contextuais, constraints e erros associados,
dialogs/menus/tabs/tabelas/paginação, avatar por teclado, contraste de bordas,
reflow e reduced motion. Axe sem suppression e regressões no Commercial Gate. Validação final: focused
architecture 47/47; browser a11y 15/15; architecture 118/118; API 1787 aprovados
e 15 F024; E2E 75/75 sem skips; build, Commercial Gate e diff aprovados;
audits backend/frontend zero vulnerabilidades.
[Contrato](ACESSIBILIDADE.md), [testes](TESTES_FET_A11Y_001.md),
[relatório](RELATORIO_FET_A11Y_001.md).

Worktree inicialmente limpo em main; F040 já commitada em 85f54ce. F033 permanece
sem commit. Banco real, SMTP, Cloudinary, índices e config.env intocados.
F024/F026 parciais, F029 aberto, F030 baseline técnico preservado, F039 remoto
pendente, F040 no código com SMTP real não validado; F001/F027 não iniciados.
Sem teste humano de leitor de tela ou zoom real: há teclado/reflow automatizados.
Próxima recomendação: inventário factual dos P2/P3 abertos, sem início automático.
Este bloco corrente prevalece sobre recomendações históricas abaixo.


## F040 — E-mails transacionais — FET-MAIL-001 (13/10/2026)

Status corrente: CORRIGIDO NO CÓDIGO, com evidências no
[RELATORIO_FET_MAIL_001.md](RELATORIO_FET_MAIL_001.md). Outbox transacional,
dedupe persistente, worker distribuído com leases/retry limitado, adapter SMTP
lazy e templates text/HTML. Order/registro/lifecycle/privacy request gravam evento
junto com o domínio; F009 permanece envio direto sem token no outbox. Destinatário
resolvido no envio; ANONYMIZED suprimido; retenção UNDEFINED. Auditoria READ_ONLY,
CLI dry-run com apply/confirm-db explícitos. Sem promessa exactly-once SMTP.

Retomada preserva worktree anterior e mantém tarefa sem commit. Testes usam DBs
temporárias/providers fake; nenhum SMTP/Cloudinary real, migration comercial ou
mudança de config.env nesta retomada. A inicialização local solicitada em 12/10
foi operação separada e não é usada como validação F040. F024/F026 parciais,
F029 aberto, F039 remoto não validado, F001/F027 adiados. F030 segue baseline
técnico. Próxima recomendação: inventariar findings P2/P3 ainda abertos e avaliar
F033 (acessibilidade), sem início automático. Este bloco prevalece sobre
recomendações históricas abaixo. [Contrato](EMAILS_TRANSACIONAIS.md).

## F030 — Privacidade e retenção — FET-PRIVACY-001

**CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO.** Inventário/classificação, request
persistente, fila admin paginada, confirmação forte, tombstone irreversível,
fencing concorrente, cleanup F019 e evento F025 transacionais, auditoria somente
leitura e UI. Shipping PII de Order, relações comerciais, ledger/claims e audit
histórico preservados. Prazos formais UNDEFINED; sem certificação jurídica.
[Contrato](PRIVACIDADE_E_RETENCAO.md), [testes](TESTES_FET_PRIVACY_001.md),
[relatório](RELATORIO_FET_PRIVACY_001.md).

Validação final: focados 85/85, API 1633 aprovados/15 skips F024,
arquitetura 71/71, E2E 59/59 sem skips, build/diff/Commercial Gate aprovados,
audits backend/frontend zero vulnerabilidades.

F039 já commitada em 2d31aa2; esta implementação sem commit. F002–F018,
F020/F021/F025/F031/F036 preservados; F019 novas substituições, F022/F037 índices
comerciais pendentes; F039 validação remota/branch protection pendentes.
F024 PARCIAL, F026 PARCIAL/CD pendente, F029 ABERTO; F001/F027 ADIADOS,
NÃO INICIADOS. Banco real, providers, config.env e auditoria histórica intocados.
Próxima recomendação **F040 — emails transacionais confiáveis com provider,
eventos de conta/pedido, outbox persistente e retries**, sem SMTP em transações.
Integração real continua F029. Não iniciar automaticamente. Este estado
prevalece sobre registros históricos, inclusive menções à F030 aberta.

## F039 ? Gates comerciais de CI ? FET-CI-001

**CORRIGIDO NO CODIGO / VALIDACAO REMOTA PENDENTE.** GitHub Actions, Node fixo,
npm ci e locks separados, MongoDB Server temporario com replica set/transacoes,
guarda contra fetech/URI externa, API/build/E2E obrigatorios, arquitetura,
repository safety/diff e audit de ambos os pacotes. Commercial Gate agrega
os seis jobs sem soft fail. F024: quinze bloqueios allowlisted; E2E: zero skips.
Enforcement remoto: **NAO VALIDADO / DESCONHECIDO**. Sem push, run remoto ou
alteracao de branch protection. [Contrato](CI_E_GATES_COMERCIAIS.md),
[testes](TESTES_FET_CI_001.md), [relatorio](RELATORIO_FET_CI_001.md).

**F026 PARCIAL:** CI implementado no codigo; CD/deployment pendente sem target.
F022 esta commitada em 2d51203, superando mencoes anteriores a worktree sujo.
Nenhuma migration comercial; indices F022/F037 pendentes, F024 parcial,
F023 infraestrutura necessaria, F029/F030 abertos, F001/F027 adiados.
Proxima recomendacao: **F030 ? baseline tecnico de privacidade e retencao**,
sem inventar prazos legais ou destruir Orders/audit/ledger; nao iniciada.
Este estado prevalece sobre registros anteriores abaixo.


## F022 — Paginação e consultas previsíveis

**CORRIGIDO NO CÓDIGO.** API 1484 aprovados/15 skips F024, E2E 57/57, build/diff/audit aprovados. Resultados no [relatório](RELATORIO_FET_PERF_001.md). Paginação central, query allowlists, summaries, frontend e índice/manifesto/migration dry-run protegida. F037 commitada em 68cb9b3; esta task sem commit. Índices comerciais não aplicados, ledger F037 continua gate; F024 parcial. Search substring/legacy/count/cursor de escala permanecem residual F038. Próxima recomendação **F039: inventariar e completar gates de CI**, sem início automático. F001/F027 adiados; F029/F030 abertos. [Contrato](PAGINACAO_E_PERFORMANCE_API.md). Este status prevalece sobre registros históricos abaixo.


## F037 — Coerência integral de Product

Status: **CORRIGIDO NO CÓDIGO** — FET-CATALOG-001.

Implementado: allowlist explícita em create/update; campos derivados/internos
rejeitados; cents F014 e relação price/oldPrice; desconto inteiro e parcela
ilustrativa centralizados; Stock safe integer >=0; ledger de criação/ajuste,
hierarquia F017 e auditoria F025 atômicos; sem lost update com reservas/reviews;
category/category_id coerentes e rename preservado; images validadas; delete
com Order/ledger bloqueado; audit:products somente leitura com snapshot.

Limites: histórico sem repair automático; ledger legado incompleto identificado;
ownership de imagens/provider real F029 aberto; privacy F030 aberto; lifecycle
mais amplo de Product separado; deploy requer índice parcial de RESERVE, sem
migração do banco real nesta tarefa. F024 segue PARCIAL e reparos comerciais
aguardam backup/restore comprovado. F001/F027 continuam adiados.
[Contrato](COERENCIA_PRODUTOS.md), [relatório](RELATORIO_FET_CATALOG_001.md).
F022 foi tratada na seção corrente acima; F037 está commitada em 68cb9b3.
Este status substitui referências históricas abaixo à F037 aberta.

## F017 — Concorrência na hierarquia de categorias — FET-DATA-005

**Status: CORRIGIDO NO CÓDIGO.** Parent existente; self e ciclos diretos/indiretos
proibidos. Toda mutação Category e Product create/atribuição de categoria por
ID ou nome escreve o singleton revision comum dentro de Mongo transaction,
antes da validação. Retries revalidam o estado; coordenação entre processos
elimina write skew. Category com children ou Product por ID/nome não é removida;
delete concorrente com child/reparent/Product assignment não cria órfãos.
AuditEvent F025 participa atomicamente. Migração aditiva existente e seed
também coordenados. `audit:categories` detecta inconsistências somente em leitura.

Históricos não são reparados; repair comercial exige revisão humana e F024.
F024 continua PARCIAL, F037 aberto e F001/F027 adiados e não iniciados.
Banco real/config.env/auditoria histórica preservados. F015 já commitada;
esta task sem commit. [Contrato](HIERARQUIA_CATEGORIAS.md),
[relatório e validações](RELATORIO_FET_DATA_005.md).
Próxima recomendação **F018 + F019 — upload/avatar**, sem início automático.
Este status prevalece sobre recomendações históricas abaixo.

## F015 — Agregação concorrente de reviews

**Status: CORRIGIDO NO CÓDIGO — FET-DATA-004.**

- Mutations atômicas no documento Product, entre processos/conexões.
- Uma review por User/Product; criações distintas preservam todas as avaliações.
- Update preserva ID/posição e count; delete recalcula agregados atomicamente.
- Count e média sem arredondamento derivam do array final.
- Mass assignment não controla reviews/ratings/count.
- Histórico inconsistente é sinalizado com 409, sem reparo arbitrário.
- `audit:reviews` detecta divergências e órfãos somente em leitura.
- F016 mantém reviews de desativados; F025 conserva audit administrativo transacional.

Limites: histórico não reparado automaticamente; revisão humana e F024 validado
antes de reparo real; moderação/privacy e outras coerências de Product (F037)
fora do escopo. F024 continua **PARCIAL**, F001/F027 adiados e não iniciados.
Banco real/config.env/auditoria histórica preservados. F016 já commitada;
esta tarefa sem commit. [Contrato](REVIEWS_CONCORRENCIA.md) e
[evidências](RELATORIO_FET_DATA_004.md). Próxima recomendação **F017 — hierarquia
de categorias sob concorrência**, sem início automático. Este status prevalece
sobre recomendações históricas abaixo.

## F016 — Lifecycle seguro de User — FET-DATA-003

**CORRIGIDO NO CÓDIGO** (08/10/2026): DELETE físico de User retorna 405; model/runtime bloqueia deletes. Lifecycle ACTIVE/DEACTIVATED com metadata técnica; desativação revoga sessões/recuperação e mantém identidade/referências, reativação exige novo login. Auth verifica status e versão; F010/CLI contam somente admins ativos. Transições e eventos F025 são atômicos. Dashboard oferece status, filtros e desativar/reativar. Auditoria audit:users é somente leitura.

Validação: focused96/96, API918 aprovados/15 skips exclusivos F024, build aprovado, E2E32/32 e diff aprovado. [Relatório](RELATORIO_FET_DATA_003.md), [contrato](LIFECYCLE_USUARIOS.md), [testes individuais](TESTES_FET_DATA_003.md).

**Limites:** PII permanece armazenada; anonimização/privacy erasure pertence a F030. Órfãos históricos não foram reparados; qualquer reparo real depende de F024 validado. F024 permanece **PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE**, sem download/drill real. F001/F027 continuam adiados. Banco real/config.env/auditoria histórica preservados; tarefa sem commit. Próxima recomendação **F015 — consistência concorrente de reviews**, sem início automático. Este status corrente prevalece sobre recomendações históricas abaixo.


## F025 / FET-P1-012 — Observabilidade operacional

**Status: CORRIGIDO NO CÓDIGO.** FET-OPS-002 (08/10/2026): implementados Request ID server-side/X-Request-Id, AsyncLocalStorage, logs JSON/LOG_LEVEL validado, redaction de secrets/PII, templates de rotas sem body/headers/query/raw URL, live/ready, audit administrativo append-only atômico e consulta admin paginada com UI mínima. Correlação header ↔ log ↔ audit e testes sentinelas/rollback. Validação: focused116/116, API822 pass/15 skipped F024, build aprovado, E2E31/31 e diff aprovado. [RELATORIO_FET_OPS_002.md](RELATORIO_FET_OPS_002.md). Contrato: [OBSERVABILIDADE.md](OBSERVABILIDADE.md).

Coleta/persistência de logs e health no deployment dependem de F023; alerting/SIEM não implementados; retenção depende de F030; analytics comercial F034 permanece aberto. F024 **PARCIAL**, scripts disponíveis e restore real pendente por ausência de mongodump/mongorestore, sem download nesta task. F001/F027 continuam adiados. Próxima recomendação F016 (lifecycle referencial/órfãos na exclusão de usuário), não iniciada automaticamente. Este status corrente prevalece sobre recomendações históricas abaixo.

## F024 / FET-P0-012 — Backup, restore e recuperação verificável

08/10/2026, FET-OPS-001: **PARCIAL / VALIDAÇÃO REAL BLOQUEADA**. Implementadas CLIs de backup BSON via mongodump, restore seguro via mongorestore em destino novo e verificação somente leitura. Manifesto/checksums obrigatórios, comparação de collections/índices/tipos BSON e invariantes; nenhuma exclusão/overwrite. Captura exige janela sem escrita e acesso ao oplog. Tools ausentes; usuário decidiu não baixar. Não houve captura, restore ou drill real; não há RTO/RPO comprovados. Não declarar F024 corrigido.

API 706 pass/15 skipped, build aprovado, E2E 30/30. Dados reais/config.env/auditoria histórica preservados. Infraestrutura ainda deve prover scheduler, off-site, criptografia/ACL, monitoramento e promoção comercial. Gate de backup+restore da própria origem antecede migrações comerciais.

F002/F003/F004/F005/F011 e remediações anteriores continuam corrigidos. F001 (pagamento) e F027 (frete) estão **adiados por decisão do usuário**. Próxima recomendação: F025 / FET-P1-012 — observabilidade, correlação, redaction e trilha administrativa; não iniciada automaticamente. [Runbook](BACKUP_RESTORE.md), [relatório](RELATORIO_FET_OPS_001.md). Este status prevalece sobre recomendações históricas abaixo.

Este documento acompanha remediações posteriores à auditoria. Não altera
os achados históricos nem transforma a correção de um finding em aprovação
geral para produção. Não iniciar outra task automaticamente.

## F006 / FET-P0-006 — Revogação de sessão JWT

**Status: CORRIGIDO.** Task FET-SEC-001, prioridade P0, concluída em 07/10/2026.

Branch: `main`.
HEAD base da implementação e validação: `37d6093fa913bd95d845be1f6f0f52489dff63fe`.
Commit da remediação: o commit que adiciona este documento e a implementação
FET-SEC-001; consulte `git log --diff-filter=A -- docs/PLANO_MELHORIAS_FETECH.md`.
O hash acima identifica a base auditada, não o commit contendo a correção.

### Finding original e reprodução antes da correção

JWT antigo continuava válido após logout, troca e reset de senha. No HEAD
inicial, `getJWTToken()` assinava somente o ID e o middleware não verificava
estado de revogação. Logout apenas apagava o cookie. Alterar a senha não
invalida criptograficamente uma assinatura JWT já emitida.

Reprodução em servidor isolado, SMTP mockado e banco temporário:

| Cenário | JWT antes | Replay do JWT anterior após evento |
| --- | --- | --- |
| Logout | `/me` 200 | `/me` 200 |
| Troca de senha | Sessão válida | `/me` 200 |
| Reset | Sessão válida | `/me` 200 |

Test-first: os primeiros 26 testes permanentes foram executados antes de
alterar o backend. Resultado: **5 aprovados, 21 falhas, zero skips**, em
9,118 s. As expectativas 401 foram mantidas. Dois testes adicionais cobrem
concorrência durante a persistência de senha.

### Estratégia implementada

`User.tokenVersion` persistido, default zero, é incluído em todos os JWTs
emitidos por `getJWTToken()`. O middleware compara estritamente o claim com
o usuário atual. Claim ausente, versão inválida/divergente, JWT expirado,
assinatura inválida e usuário removido retornam 401 com mensagem genérica.

Eventos de revogação: logout, alteração autenticada de senha e reset.
Logout usa update condicional e `$inc` atômico, sem exigir middleware que
impediria limpar cookies inválidos. Somente a versão ainda corrente pode
alterar o documento. Replay de logout antigo preserva a sessão nova; duas
chamadas simultâneas incrementam somente uma vez.

Troca/reset preservam bcrypt e salvam senha/versão na mesma escrita do User,
condicionada à versão lida. Reset limpa hash/expiração e condiciona também
ao token original ainda válido. Uma revogação concorrente impede o save
desatualizado de restaurar versões. Login e mudança de role não incrementam.
Cadastro/perfil/admin ignoram o campo no input.

### Compatibilidade e deploy

Usuários antigos sem campo persistido usam default zero do Mongoose.
Login funciona sem correção manual; logout e save posterior persistem o
campo. Não foi criada migration, coleção Session ou dependência nova.

**JWTs emitidos antes da implementação serão invalidados e usuários
autenticados anteriormente precisarão fazer login novamente.** É um logout
global intencional após o deploy, sem fallback para JWT sem versão.
Reiniciar todos os processos da API é necessário para carregar o código.
Os processos locais anteriormente iniciados não foram reiniciados nesta
task, pois a execução da correção e seus testes usaram somente bases isoladas.

### Testes permanentes adicionados

Arquivo: `ecommerce/tests/auth.test.js`, com infraestrutura em
`ecommerce/tests/authHarness.js`.

| ID | Cenário |
| --- | --- |
| TEST-01 | JWT atual autentica, versão inicial zero e login não incrementa. |
| TEST-02 | JWT legado sem versão retorna 401. |
| TEST-03 | Versão divergente retorna 401. |
| TEST-04 | Logout revoga cópia manual do cookie anterior. |
| TEST-05 | Logout expira cookie HttpOnly. |
| TEST-06 | Novo login após logout autentica na nova versão. |
| TEST-07 | Replay de logout antigo não derruba sessão nova. |
| TEST-08 | Dois logouts simultâneos incrementam exatamente uma vez. |
| TEST-09 | Troca de senha revoga JWT antigo e valida o novo. |
| TEST-10 | Senha antiga falha e senha nova permite login. |
| TEST-11 | Reset revoga JWT anterior. |
| TEST-12 | Sessão pós-reset e novo login funcionam. |
| TEST-13 | Reset single-use e limpeza do hash/expiração. |
| TEST-14 | Conta removida retorna 401; logout permanece seguro. |
| TEST-15 | Role persistida remove acesso admin com 403 sem revogar autenticação. |
| TEST-16 | Cadastro ignora tokenVersion enviado pelo cliente. |
| TEST-17 | Atualização de perfil ignora tokenVersion do cliente. |
| TEST-18 | Atualização administrativa ignora tokenVersion do cliente. |
| TEST-19 | Expiração, assinatura inválida e token legado usam mensagem genérica. |
| TEST-20 | Versões com tipos/valores inválidos e ID inválido são rejeitadas. |
| TEST-21 | Logout sem sessão, inválido, expirado, legado ou divergente não incrementa. |
| TEST-22 | Logout revoga todas as sessões da versão corrente. |
| TEST-23 | Login legado e logout concorrente sem campo persistido. |
| TEST-24 | Troca/reset de usuário legado persistem senha e versão. |
| TEST-25 | Senha rejeitada não incrementa versão nem revoga sessão. |
| TEST-26 | Recuperação preserva SHA-256, expiração e limpeza na falha SMTP. |
| TEST-27 | Save de senha iniciado antes de logouts não restaura versão antiga. |
| TEST-28 | Trocas simultâneas de senha têm apenas um save/sessão vencedor. |

Os 13 grupos anteriores permanecem na suíte completa. O helper antigo agora
captura o cookie novo após troca/reset e comprova 401 usando o anterior;
após logout faz novo login para os testes independentes subsequentes.
Mensagens de falha não incluem corpos contendo JWT ou URL de recuperação.
Nenhum teste foi removido, ignorado ou teve expectativa de segurança relaxada.

### Validação final

| Comando | Resultado | Duração disponível |
| --- | --- | --- |
| `node --test ecommerce/tests/auth.test.js` | 28/28 aprovados; zero falhas/skips | 12,677 s |
| `npm.cmd test --prefix ecommerce` | 41/41 aprovados; zero falhas/skips | 9,518 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado | Vite: 2,98 s |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19 aprovados | Playwright: 1,9 min |

### Probes pós-correção

Script isolado local, sem emissão externa de e-mails; somente status e
versões foram registrados, sem cookies, JWTs, secrets ou senhas reais.

| Probe | Resultado |
| --- | --- |
| A — Logout | `/me` antes 200; replay após logout 401. |
| B — Troca de senha | JWT antigo 401; JWT novo 200. |
| C — Reset | JWT antigo 401; JWT novo 200. |
| D — Replay de logout antigo | JWT novo permanece 200. |
| E — Logout simultâneo | Versão inicial 0; final 1, sem incremento duplo. |

### Isolamento e escopo

Bases `fetech_routes_auth_<pid>_<timestamp>`, `fetech_routes_*` e
`fetech_e2e_*`, com teardown. **BANCO REAL NÃO ALTERADO.** Configuração real
não foi sobrescrita e nenhum secret/JWT/cookie real foi registrado.
O relatório histórico da auditoria não foi editado.

Alterações funcionais fora de escopo: **NENHUMA**. Frontend, contratos de
pedido/estoque, método GET de logout e opções de cookie foram preservados.
`ecommerce/package.json` só amplia o runner para incluir o novo arquivo de
testes; nenhuma dependência ou lockfile foi alterado.

### Riscos residuais e próxima task

Logout invalida globalmente todas as sessões da versão corrente. Sessões
individuais por dispositivo não existem. Rate limiting, MFA, cookie Secure,
hardening HTTP/CSRF e retirada do JWT do JSON continuam pendentes.
O limite terminal de inteiro seguro falha fechado; não há overflow silencioso.

Próxima task recomendada: **F008 / FET-P0-008 — proteção contra brute force
e rate limiting de autenticação e recuperação**. Não iniciada.

Documentação atualizada: `README.md`, `ROTAS.md`,
`docs/ESTADO_ATUAL_PROJETO_FETECH.md` e `docs/AUTENTICACAO.md`.

## F008 / FET-P0-008 — Rate limiting

**Status: CORRIGIDO.** Task FET-SEC-002, prioridade P0, concluída em 07/10/2026.
Branch `main`; HEAD inicial `92e83494cfd7e8899fe353fa420d17a9efcc2a44`, worktree
inicial limpo. A implementação permanece no worktree, sem novo commit.

### Finding e reprodução

Login e recuperação permitiam tentativas ilimitadas. Em servidor e banco
temporários, foram executadas **12 tentativas inválidas consecutivas**:
**12 respostas 401, zero 429**, em aproximadamente **1,020 s**. Nenhuma senha,
conta real, cookie, JWT ou segredo foi registrado.

Test-first: os primeiros 28 testes foram adicionados antes de alterar o
backend; **5 passaram e 23 falharam**, em 13,662 s, sem skip. Depois foram
adicionados cenários complementares de falha parcial, índice e normalização.
O cenário de formato alternativo de e-mail também foi executado vermelho
antes da correção: retornava 401 quando deveria compartilhar o bloqueio 429.
Nenhuma expectativa de segurança foi relaxada.

### Solução e políticas

Rate limiting distribuído persistido em MongoDB, sem Redis ou dependência
nova. Model `AuthRateLimit`, coleção `authratelimits`, campos `_id` (HMAC),
`scope`, `count`, `pending`, `windowStartedAt`, `expiresAt`. Índices: `_id_`
único e `expiresAt_1` TTL (`expireAfterSeconds: 0`). A API prepara o índice
antes de abrir a porta; acesso principal usa `_id`, sem collection scan.

| Scope | Limite | Janela |
| --- | --- | --- |
| Login conta+IP | 5 falhas | 15 min |
| Login conta global | 20 falhas | 15 min |
| Login IP | 50 falhas | 15 min |
| Recuperação conta | 5 requisições | 15 min |
| Recuperação IP | 10 requisições | 15 min |
| Reset IP | 10 requisições | 15 min |
| Cadastro IP | 10 tentativas | 60 min |

Políticas em `backend/config/authRateLimits.js`. Contas existentes e
inexistentes têm a mesma derivação de chave, sem consulta prévia ao User.
Normalização acompanha os controllers existentes, com trim/lowercase.
Chaves HMAC-SHA256 usam a JWT_SECRET já existente com separação de domínio;
não são persistidos e-mail, IP puro, senha, cookie, JWT ou reset token.
As instâncias precisam compartilhar chave/política e ter relógios sincronizados.

IP vem de `req.ip`, mantendo `trust proxy=false`. Alterar X-Forwarded-For
não renova quotas. A configuração definitiva de proxies depende da topologia
de produção; no proxy local atual os clientes compartilham o IP do proxy.

### Concorrência, expiração e falhas

Janela fixa por chave, iniciada pela primeira tentativa. Pipeline de
`findOneAndUpdate` reseta janelas vencidas e adquire capacidade atomicamente.
Login reserva `pending` antes de consulta de senha/bcrypt, considerando
`count + pending`. Falha converte reserva em contador; sucesso limpa falhas
de conta/conta+IP, preserva contador global de IP e reservas de outras requisições.
Formulários incompletos e demais erros de login também consomem tentativas.

Se um scope posterior negar acesso, reservas anteriores são liberadas uma
vez. A conclusão aguarda todas as operações iniciadas, mesmo havendo falha
parcial. Não há retry cego de decrementos. Conclusões de janelas antigas
não alteram janelas novas. Reservas abandonadas por queda/falha expiram
logicamente com a janela; não há bloqueio permanente.

Forgot/reset/register consomem quotas antes do controller. Em forgot, a
quota de IP admitida pode ser consumida mesmo se a conta negar a solicitação.
Bloqueio impede geração/substituição de token, SMTP e cadastro adicional.
Logout e alteração autenticada de senha não recebem este limiter.

Resposta de bloqueio: **429**, mensagem genérica e **Retry-After**, sem revelar
scope ou existência de conta. Falha de storage: **503**, sem fallback local
ou emissão de sessão. TTL é cleanup eventual; timestamps determinam a
expiração mesmo que o documento ainda exista. Nenhuma alteração no User
para contadores, lock ou tentativas. Store separado permite troca futura.

### Testes permanentes

Arquivo `ecommerce/tests/rateLimit.test.js`, reutilizando `authHarness.js`.
Os casos JWT existentes limpam a coleção entre casos para isolamento,
sem desabilitar o limiter. Nenhum teste anterior foi removido/enfraquecido.

| ID | Cenário |
| --- | --- |
| RL-01 | Login abaixo do teto mantém 401. |
| RL-02 | Sexta tentativa conta+IP retorna 429. |
| RL-03 | Resposta 429 genérica e sem dados internos. |
| RL-04 | Sucesso limpa conta/conta+IP; próxima falha começa em um. |
| RL-05 | Sucesso preserva falhas globais do IP. |
| RL-06 | Conta inexistente também é limitada. |
| RL-07 | Distribuição entre contas atinge teto de IP. |
| RL-08 | IPs distintos atingem teto global de conta. |
| RL-09 | Spoof de X-Forwarded-For não renova quotas. |
| RL-10 | Quatro falhas + três simultâneas: uma 401 e duas 429. |
| RL-11 | Retry-After existe e é positivo. |
| RL-12 | Janela de 100 ms expira logicamente sem exclusão TTL. |
| RL-13 | Recuperação permitida mantém SMTP mockado. |
| RL-14 | Recuperação bloqueada não envia nem substitui token. |
| RL-15 | Reset inválido atinge teto IP. |
| RL-16 | Cadastro bloqueado não cria conta adicional. |
| RL-17 | Dois serviços/conexões independentes compartilham contadores. |
| RL-18 | Chave única, TTL e timestamps presentes. |
| RL-19 | Logout continua disponível e replay JWT retorna 401. |
| RL-20 | Troca de senha mantém revogação e sessão nova válida. |
| RL-21 | Reset mantém revogação e single-use. |
| RL-22 | Bloqueio ocorre antes de consulta de senha/bcrypt. |
| RL-23 | Login/forgot/reset/register usam scopes independentes. |
| RL-24 | Trim/lowercase compartilham chave de conta. |
| RL-25 | Storage contém somente campos previstos e identificadores derivados. |
| RL-26 | Falha do storage retorna 503 sem bcrypt/fallback. |
| RL-27 | Concorrência na criação inicial respeita chave única e teto. |
| RL-28 | Reservas abandonadas expiram; conclusão antiga preserva janela nova. |
| RL-29 | Forgot limita IP mesmo entre contas inexistentes. |
| RL-30 | Falha na aquisição de scope libera reserva anterior. |
| RL-31 | Falha na conclusão não emite cookie/JWT. |
| RL-32 | Consulta por chave examina um documento e uma chave, sem COLLSCAN. |
| RL-33 | Conclusão repetida não incrementa novamente. |
| RL-34 | Liberação parcial não libera reserva de outra requisição. |
| RL-35 | Formato alternativo de e-mail convertido pelo controller não cria quota nova. |

### Probes pós-correção

| Probe | Resultado |
| --- | --- |
| Login | 12 tentativas: primeiras cinco 401; sete seguintes 429. Primeiro 429 na sexta; Retry-After 900 s. |
| Recuperação | Cinco envios mockados; sexta 429, sem novo envio/token. |
| Concorrência | Após quatro falhas: três simultâneas resultaram em 401, 429, 429. |
| Spoof | Cinco headers distintos resultaram em 401; sexto header distinto retornou 429. |

Multi-instância: dois serviços com stores e conexões Mongo independentes,
mesma base temporária. A registrou três falhas; B registrou mais duas; ambas
observaram bloqueio da mesma chave. Sem memória compartilhada de contadores.

### Validação final de FET-SEC-002

| Comando | Resultado | Duração disponível |
| --- | --- | --- |
| `node --test ecommerce/tests/rateLimit.test.js` | 35/35 aprovados; zero falhas/skips | 20,429 s |
| `npm.cmd test --prefix ecommerce` | 76/76 aprovados; inclui os 28 testes JWT e 13 grupos anteriores | 18,990 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado | Vite: 457 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19 aprovados | Playwright: 1,5 min |

O diagnóstico de ausência de JWT após falha do storage foi revalidado
isoladamente após tornar a asserção segura para não imprimir tokens em falhas.
Índice principal confirmado por explain: um documento e uma chave examinados,
sem COLLSCAN. Bases temporárias removidas no teardown.

### Isolamento, documentação e escopo

Bases temporárias `fetech_routes_auth_<pid>_<timestamp>`, `fetech_routes_*`
e `fetech_e2e_*`, com teardown. SMTP mockado, segredo JWT efêmero no teste,
config.env real preservado. **BANCO REAL NÃO ALTERADO.** Os processos locais
anteriores não foram reiniciados contra a base real nesta task; carregar o
novo código exige reiniciar a API. Nenhum relatório histórico foi editado.

Frontend preservado: seu tratamento centralizado já apresenta a mensagem
da API, incluindo 429. Não foi criado E2E artificial; todos os fluxos
existentes continuam como gate. Documentos atualizados: AUTENTICACAO,
PLANO_MELHORIAS, README, ROTAS e ESTADO_ATUAL_PROJETO_FETECH.

Alterações funcionais fora de escopo: **NENHUMA**. Nenhuma dependência ou
lockfile alterado; npm audit não reexecutado por não haver mudança de dependências.

### Riscos residuais e próxima task

**F009 / FET-P1-001 — recuperação revela existência de conta permanece aberto.**
MFA permanece ausente. Proxy/trust proxy definitivo depende da infraestrutura;
MongoDB é dependência de disponibilidade e capacidade do limiter. Observabilidade
e alertas completos serão tratados posteriormente. Bot/CAPTCHA está fora do
escopo. Ataques distribuídos ainda podem causar restrição temporária a uma
conta; por isso o teto global de conta (20) é mais permissivo que conta+IP (5).

Próxima task recomendada: **F009 / FET-P1-001 — eliminar enumeração de contas
no fluxo de recuperação de senha**. Não iniciada.

## F009 / FET-P1-001 — Enumeração na recuperação de senha

**Status: CORRIGIDO — FET-SEC-003, 07/10/2026.**
Branch `main`; HEAD inicial/final `92e83494cfd7e8899fe353fa420d17a9efcc2a44`.
F006 e alterações anteriores de F008 preservadas; nenhuma alteração commitada
nesta task. Nenhuma dependência/lockfile/config.env real alterado. Auditoria
histórica preservada. Apenas bases temporárias; nenhum e-mail real enviado.

### Finding, reprodução e causa raiz

Baseline repetido: API 76/76 em 19,881 s. Probe anterior com fixtures:

| Caso | Status | Body anterior |
| --- | --- | --- |
| Existente | 200 | `success:true`, `message:Email send to <fixture> successfully` |
| Inexistente | 404 | `success:false`, `message:User not found` |
| Existente + falha SMTP | 503 | `success:false`, `message:SMTP de teste indisponível` |

Content-Type JSON nos três casos, sem Set-Cookie; status/corpo distintos já
permitiam enumeração. O controller retornava cedo para inexistente e propagava
erro SMTP somente quando uma conta era encontrada. Suíte escrita antes da
correção: 23 testes, 12 falhas e 11 passes. Depois foram adicionados dois gates
extras para limpeza concorrente e falha estrutural de lookup.

### Solução e contrato novo

Solicitações permitidas recebem HTTP 200 e exatamente:

```json
{
  "success": true,
  "message": "Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha."
}
```

Existente/inexistente/SMTP ausente/SMTP falho são equivalentes em status, JSON
e headers específicos. Sem PII ou confirmação de envio. Inexistente não cria
User/hash nem chama SMTP. Sucesso mantém token seguro/hash/expiry; falha limpa
hash/expiry por ID + hash original e registra somente o evento constante
`password_recovery_email_failed`. Falhas estruturais seguem middleware normal.
F008 permanece antes do controller, mantendo 429 e Retry-After.

Piso assíncrono com relógio monotônico: `AUTH_FORGOT_MIN_RESPONSE_MS`, default
300 ms, testes 20 ms, valores finitos de 0 a 5000, inválidos usam 300.
Timer aguarda o tempo restante sem bloquear o event loop; helper permite
relógio/sleep injetados. Configuração zero desativa o piso. Sem fila/outbox.
A UI existente apresenta a mensagem da API e preserva erros 429/globais.

### Testes permanentes adicionados

Arquivo `ecommerce/tests/passwordRecoverySecurity.test.js`:

| Teste | Cobertura |
| --- | --- |
| PR-01 | Existente, 200 genérico |
| PR-02 | Inexistente, 200 genérico |
| PR-03 | Igualdade de status, body e headers públicos |
| PR-04 | Falha SMTP, 200 genérico |
| PR-05 | Limpeza persistida de hash/expiry |
| PR-06 | Sucesso mantém SHA-256 e expiração futura |
| PR-07 | Inexistente não cria User/recuperação |
| PR-08 | Inexistente não envia SMTP |
| PR-09 | Existente envia uma vez |
| PR-10 | Ambos bloqueiam na sexta tentativa com Retry-After |
| PR-11 | Bloqueio impede SMTP |
| PR-12 | Bloqueio preserva token/expiração |
| PR-13 | Trim/lowercase/coerção mantêm identidade e contrato |
| PR-14 | Nenhuma PII/estado interno na resposta |
| PR-15 | Logging somente com evento constante seguro |
| PR-16 | Reset single-use |
| PR-17 | JWT anterior retorna 401 após reset |
| PR-18 | Sessão nova pós-reset retorna 200 |
| PR-19 | Piso temporal de inexistente |
| PR-20 | Piso temporal de existente/SMTP rápido |
| PR-21 | Equalização determinística e operações além do piso |
| PR-22 | SMTP não configurado mantém contrato e limpa token |
| PR-23 | Limiter indisponível continua 503 |
| PR-24 | Falha antiga preserva token concorrente mais recente |
| PR-25 | Erro estrutural de lookup não vira sucesso |

Expectativas antigas de forgot 404/503 atualizadas para o contrato genérico;
asserts de limpeza, expiração, quotas, JWT e single-use foram preservados.
E2E de recuperação verifica a nova mensagem pública; frontend não exige mudança.

### Verificação e probes finais

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/passwordRecoverySecurity.test.js` | 25/25, 5,232 s |
| `npm.cmd test --prefix ecommerce` | 101/101, 19,943 s; inclui 28 JWT e 35 limiter |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, 683 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19, 1,7 min |

Uma execução intermediária de E2E falhou por acentos corrompidos na expectativa
do teste de recuperação. Expectativa corrigida em UTF-8; suíte completa repetida
e aprovada. A API já retornava a mensagem correta. Nenhum teste foi removido.

Probe final: existente/inexistente/SMTP falho retornam o JSON genérico acima e
HTTP 200. Status igual: SIM; body igual: SIM. Existente: SMTP mock uma vez,
token criado (valor não registrado). Inexistente: nenhum SMTP. Falha: token
ausente após limpeza. Primeiro 429: sexta tentativa; Retry-After: 899 segundos.

Timing local de cinco amostras por caso, piso 300 ms e SMTP mock, sem exceder
limiter (limpeza de contadores na base temporária entre grupos):

| Caso | Mínimo | Mediana | Máximo |
| --- | --- | --- | --- |
| Existente | 317,96 ms | 325,94 ms | 342,42 ms |
| Inexistente | 315,34 ms | 325,51 ms | 327,32 ms |

**Este probe local não comprova resistência absoluta a timing attacks em produção.**
F006 continua corrigido (PR-16/17/18, suíte JWT 28/28). F008 continua corrigido
(PR-10/11/12/23, suíte limiter 35/35). Bases `fetech_routes_auth_*`,
`fetech_routes_*`, `fetech_e2e_*`, removidas no teardown.
**BANCO REAL NÃO ALTERADO. NENHUM E-MAIL REAL ENVIADO.**

### Riscos residuais e continuidade

Latência SMTP real pode ultrapassar o piso. F040 tratará processamento assíncrono
e outbox; observabilidade completa permanece pendente. Forgots concorrentes
podem sobrescrever tokens; último save prevalece e links anteriores podem
ficar inválidos. Limpeza condicionada protege uma recuperação mais recente.
MFA continua ausente; limiter depende de MongoDB; hardening HTTP/cookies,
proxy definitivo e alertas ainda exigem tarefas próprias. Nenhuma correção
fora de escopo iniciada. Reiniciar API será necessário para carregar o código;
processos antigos não foram reiniciados contra a base real durante a task.

Documentos vivos atualizados: README, ROTAS, AUTENTICACAO, ESTADO_ATUAL e este
plano; relatórios históricos não alterados. Sem alterações de dependências,
npm audit não foi necessário nesta task.

Próxima recomendação: **F010 / FET-P1-002 — impedir autoexclusão,
autorrebaixamento e perda do último administrador; bootstrap administrativo
seguro.** Não iniciada automaticamente.

## F010 / FET-P1-002 — Segurança administrativa

**Status: CORRIGIDO — FET-SEC-004, 08/10/2026.**

Branch main; HEAD inicial/final `101f61be501d266dcf7ae609181498fee5440803`.
Worktree inicialmente limpo: F008/F009 já estavam commitados. Referência do
anexo ao HEAD 92e8349 não representava o estado atual. Correções F006/8/9
preservadas. Alterações FET-SEC-004 permanecem sem commit.

### Finding e reprodução anterior

Baseline repetido: 101/101 API em 19,161 s. Build/E2E anteriores confiáveis:
build aprovado e 19/19 E2E. Probe anterior em fixture temporária:

| Caso | Resultado anterior |
| --- | --- |
| Autoexclusão | 200; conta removida; adminCount 1→0 |
| Autorrebaixamento | 200; role passou a user; adminCount 1→0 |
| A rebaixa B / B exclui A simultaneamente | 200/200; adminCount 2→0 |

Causa raiz: controllers confiavam na autorização anterior à mutação e não
aplicavam autoação/contagem/serialização; UI desabilitada não protegia API.
Não havia bootstrap seguro. Suíte criada antes da correção: 30 testes,
20 falhas e 10 passes; depois ampliada para 41 cenários.

### Correção

Autoexclusão/autorrebaixamento administrativos: 403 no backend. Manter admin
ou atualizar campos sem mudar role continua permitido. Outro admin pode ser
rebaixado/excluído se resta um admin. User pode ser promovido e exclusão comum
permanece. Último admin: 409. Executor/alvo/contagem recarregados no lock.

Lock compartilhado `adminmutationlocks`, `_id` único `admin-user-mutation`:
owner UUID, lockedUntil, fence crescente, bootstrapUserId reservado, timestamps.
Lease 10 s com relógio MongoDB, retry a cada 40 ms por até 1,5 s, maxTimeMS 2 s
nas queries do lock. Finalmente libera somente owner/geração corretos. Sem TTL,
pois documento mantém a geração; sem transação/replica set obrigatório.
Conflito 409, falha do storage 503, mensagens seguras sem detalhes internos.

`User.adminMutationFence` interno select:false, oculto no JSON. Aquisição nova
marca admins antes das leituras; update/delete exigem geração e role originais.
Isso protege escritas pausadas após expiração. Bootstrap reserva mesmo ID para
operações concorrentes/atrasadas e reutiliza User/validação/hook bcrypt. Não há
incremento ou alteração de tokenVersion nas mutações administrativas.

Bootstrap oficial: `npm.cmd run admin:bootstrap --prefix ecommerce`.
Zero admins, terminal interativo, confirmação exata da database, senha oculta,
sem credenciais padrão/args/arquivos/endpoint HTTP. Contagem revalidada dentro
do mesmo lock. E-mail existente aborta sem promoção/senha alterada. Admin já
existente aborta. Conexão inicial desativa autoCreate/autoIndex; preparação
dos índices de User acontece somente após confirmar a database. Exit codes
0 sucesso, 1 recusa/cancelamento/erro. Login normal após criar, com F008 e JWT.
Avatar default; nenhum SMTP/Cloudinary. Seed passa a aceitar o primeiro admin
por `_id`, eliminando dependência de e-mail fixo na instalação documentada.

### Testes permanentes

Arquivo `ecommerce/tests/adminSafety.test.js`:

| Teste | Cobertura |
| --- | --- |
| AS-01 | Autoexclusão 403, admin preservado |
| AS-02 | Autorrebaixamento 403, role preservada |
| AS-03 | Invariante do último admin em rebaixamento, service 409 |
| AS-04 | Invariante do último admin em exclusão, service 409 |
| AS-05 | Rebaixar outro admin legitimamente |
| AS-06 | Excluir outro admin legitimamente |
| AS-07 | Promover user |
| AS-08 | User não altera role |
| AS-09 | User não exclui conta |
| AS-10 | Rebaixamentos concorrentes mantêm admin |
| AS-11 | Delete/rebaixamento concorrentes mantêm admin |
| AS-12 | Exclusões concorrentes mantêm admin |
| AS-13 | Lock compartilhado por conexões independentes |
| AS-14 | Recuperação lógica de lease vencido |
| AS-15 | Owner incorreto não libera lock |
| AS-16 | Exception libera lock em finally |
| AS-17 | Bootstrap zero admins cria um |
| AS-18 | Bootstrap com admin existente recusa |
| AS-19 | Bootstraps concorrentes criam somente um |
| AS-20 | Hash pelo hook e login normal |
| AS-21 | Senha obrigatória, sem default |
| AS-22 | Cadastro público preserva role user |
| AS-23 | Body não altera tokenVersion/fence; fence oculto |
| AS-24 | Role atual retira acesso admin imediatamente |
| AS-25 | Admin removido/JWT antigo 401 |
| AS-26 | Exclusão de user comum preservada |
| AS-27 | Confirmação errada impede criação e preparação de índices |
| AS-28 | Nome/email/senha/confirmação inválidos recusados |
| AS-29 | CLI sem senha na saída; preparação só após confirmação |
| AS-30 | Sem default/secret de bootstrap; argumentos recusados sem eco |
| AS-31 | Atualização própria sem rebaixamento permitida |
| AS-32 | Conta existente não é promovida ou tem senha alterada |
| AS-33 | Executor revalidado dentro do lock |
| AS-34 | Escrita atrasada após lease não remove último admin |
| AS-35 | Serviços/conexões Mongo independentes preservam admin |
| AS-36 | Bootstrap atrasado após lease não duplica criação |
| AS-37 | Prompt real de readline oculta eco da senha |
| AS-38 | Owner antigo não libera lease novo |
| AS-39 | Nenhum endpoint HTTP de bootstrap |
| AS-40 | Admin/user preservam resposta genérica F009 |
| AS-41 | Admin criado pelo bootstrap usa quota normal F008 |

E2E do dashboard ampliado para confirmar controles próprios desabilitados,
apresentação de mensagens 403/409 e manutenção da role após erro. Promoção/
rebaixamento seguintes continuam funcionando. Frontend não exigiu alteração.

### Validação final

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/adminSafety.test.js` | 41/41, 11,947 s |
| `npm.cmd test --prefix ecommerce` | 142/142, 21,684 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, 679 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19, 1,8 min |

Nenhum teste anterior removido ou enfraquecido. API completa inclui 28 testes
JWT, 35 de rate limiting e 25 de recuperação, além de CRUDs e novos gates admin.

### Probes após correção

| Probe | Resultado |
| --- | --- |
| Autoexclusão | 403, conta preservada, adminCount 1 |
| Autorrebaixamento | 403, role admin preservada, adminCount 1 |
| Último admin, invariante direta do service | 409, adminCount 1 |
| A rebaixa B / B exclui A, simultâneos | 403/200 no probe final, adminCount 1 |
| Bootstrap | adminCount 0→1, login normal 200 |
| Bootstrap repetido | 409, adminCount 1 |

Consulta role avaliada com explain: COLLSCAN examinou um documento na fixture
final. Não se adicionou índice role sem evidência de ganho nesse volume;
avaliar capacidade/seletividade em tarefa operacional. Índice `_id_` do lock
é automático e único; User mantém índices `_id_` e e-mail único.

### Isolamento e continuidade

Somente `fetech_routes_auth_*`, `fetech_routes_*`, `fetech_e2e_*`, com teardown.
**BANCO REAL NÃO ALTERADO.** Nenhum e-mail real enviado ou bootstrap executado
contra base real. Config.env e auditoria histórica não alterados. Sem nova
dependência/lockfile; package.json alterado somente para script, audit não
reexecutado por não haver mudança de dependências.

Documentos vivos: ADMINISTRACAO, AUTENTICACAO, README, COMANDOS, ROTAS,
ESTADO_ATUAL e este plano. Reiniciar todas as instâncias da API para carregar
as garantias; não manter versões antigas atendendo mutações administrativas.
Singleton/gerações não devem ser apagados manualmente. Nenhum processo real
reiniciado nesta task. Ajuste do seed limitado à compatibilidade do bootstrap;
produtos/pagamento/estoque/frete não tiveram contratos alterados.

F006 continua corrigido (AS-23/24/25); F008 continua corrigido (AS-41);
F009 continua corrigido (AS-40). Suítes anteriores completas permanecem como
gate. F016 (relações órfãs/lifecycle), F025 (trilha administrativa completa),
MFA administrativo e RBAC granular continuam pendentes. Disponibilidade do
MongoDB e atualização coordenada das instâncias exigem cuidado operacional.

Próxima recomendação: **F007 / FET-P0-007 — hardening do cookie de autenticação
para produção, Secure, TLS/reverse proxy e configuração segura por ambiente.**
Não iniciada automaticamente.

## F007 / FET-P0-007 — cookie de autenticação e proxy

**Status: CORRIGIDO — FET-SEC-005, 08/10/2026.**

Baseline factual: branch main, HEAD inicial/final
`069e589d00572ec79af33159d1b2c218d13ef5e0`, worktree inicialmente limpo.
F010 já commitada/preservada. SEC-005 sem commit. Baseline API: 142/142,
20,532 s. Reprodução isolada antes: development e production emitiam cookie
sem Secure; ambos com HttpOnly/Lax/Path=/, host-only. Logout não incluía
SameSite e tampouco Secure em produção, embora revogação/replay já fosse 401.
Primeiros 30 testes: 16 falhas/14 passes, confirmando ausência das garantias.

Correção: authCookie centraliza opções para sendToken e logout; Secure imposto
somente por NODE_ENV=production, sem override inseguro nem influência de
headers/req.secure. ClearCookie recebe só atributos base, Express expira cookie.
COOKIE_EXPIRE continua em dias (7), com validação mínima no startup/emissão.
trustProxy aceita strings 0..5, ausência/0 false; demais valores falham startup.
Config.env.example documenta 0; config.env real não foi modificado. Test fixtures
fixam test/proxy0; E2E verifica atributos e desaparecimento do cookie no browser.
Nenhuma dependência, coleção ou schema novo; contratos de API preservados.

### Testes permanentes adicionados

Arquivo: `ecommerce/tests/authCookieSecurity.test.js`.

| ID | Garantia |
| --- | --- |
| CC-01 | Desenvolvimento HTTP utilizável |
| CC-02 | Produção Secure |
| CC-03 | Override COOKIE_SECURE=false não enfraquece produção |
| CC-04 | Cadastro com política de produção |
| CC-05 | Login com política de produção |
| CC-06 | Troca de senha, política e revogação anterior |
| CC-07 | Reset, política e revogação anterior |
| CC-08 | Logout development expira cookie |
| CC-09 | Logout production expira cookie Secure |
| CC-10 | Path igual na emissão/limpeza |
| CC-11 | SameSite igual na emissão/limpeza |
| CC-12 | Secure igual na emissão/limpeza |
| CC-13 | HttpOnly nos três ambientes |
| CC-14 | Host-only, sem Domain |
| CC-15 | COOKIE_EXPIRE sete dias |
| CC-16 | Replay após logout production retorna 401 |
| CC-17 | Logout antigo não revoga login novo |
| CC-18 | App default trust proxy=false |
| CC-19 | XFF variável não burla default |
| CC-20 | Hops=1 resolve cadeia direita→esquerda |
| CC-21 | Hops inválidos rejeitados |
| CC-22 | F008 sexta falha 429 + Retry-After |
| CC-23 | F009 recuperação uniforme |
| CC-24 | F010 autoações 403 |
| CC-25 | Todos os emissores equivalentes |
| CC-26 | Login/logout/login com único cookie Path=/ |
| CC-27 | Duração inválida recusada, fração positiva aceita |
| CC-28 | Proxy inválido impede startup |
| CC-29 | Headers de protocolo não controlam Secure |
| CC-30 | Limpeza sem expires/maxAge fornecidos |
| CC-31 | COOKIE_EXPIRE ausente/inválido impede startup |
| CC-32 | Ausência e hops 0..5 exatos |
| CC-33 | Ambiente desconhecido documentado como não produtivo |

### Validação e probes

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/authCookieSecurity.test.js` | 33/33, 9,514 s |
| `npm.cmd test --prefix ecommerce` | 175/175, 22,713 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, Vite 714 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19, 1,8 min |

Audit não reexecutado: nenhuma dependência/lockfile mudou. Testes F006/F008/
F009/F010 completos permaneceram verdes. Probes exibiram somente atributos
e status, sem JWT, senha ou segredo: development Secure=false; production
Secure=true; ambos HttpOnly/Lax/Path=/ e sem Domain; logout com mesmos atributos,
expiração passada e replay 401. Default trust=false: XFF variável, sexta falha
429, Retry-After=900. App em processo isolado com TRUST_PROXY_HOPS=1 mostrou
trust=1; CC-20 resolveu `203.0.113.5, 198.51.100.7` para req.ip=198.51.100.7.
Nenhum proxy/deployment HTTPS real foi criado. Hops exige topologia conhecida,
headers saneados e nenhum acesso direto/caminho menor que o esperado; referência:
[Express atrás de proxies](https://expressjs.com/en/5x/guide/behind-proxies/).

Somente bancos `fetech_routes_auth_*`, `fetech_routes_*`, `fetech_e2e_*`, removidos
no teardown. **BANCO REAL NÃO ALTERADO. CONFIG.ENV NÃO SOBRESCRITO E NENHUM
SEGREDO EXPOSTO. AUDITORIA HISTÓRICA NÃO ALTERADA.** Nenhum processo real
reiniciado; reiniciar todas as APIs para carregar a política nova.

Documentação viva: README, COMANDOS, ROTAS, AUTENTICACAO, ESTADO_ATUAL e este
plano. Fora de escopo: nenhuma alteração. F020 (headers/CSRF), F021 (JWT JSON /
cache privado), F023 (deployment TLS) e F036 (env completo) continuam abertos.
HTTPS real necessário em produção; TLS/proxy ainda não implantados. Topologia
de proxy deve corresponder à infraestrutura; HSTS/Helmet/CSP e CSRF explícito
continuam pendentes. JWT JSON permanece até F021. Próxima task recomendada:
**F021 / FET-P1-010 — remover JWT do JSON e aplicar Cache-Control: no-store às
respostas privadas de autenticação, conta, endereços e pedidos.** Não iniciada.

## F021 / FET-P1-010 — Exposição do JWT e cache privado

**Status: CORRIGIDO — FET-SEC-006, 08/10/2026.**

Início factual: main, HEAD `5a9e4ec41a10fe16630d41af355fac476f3bedb5`, worktree
limpo. F007 já commitada, F006/F008/F009/F010 preservados. HEAD final igual;
SEC-006 permanece sem commit. Baseline 175/175 API, 22,868 s.

Reprodução isolada anterior: login/cadastro/update/reset continham body.token,
embora cookie HttpOnly/Secure existisse em produção simulada. /me, /addresses,
/orders/me, /admin/users e logout sem Cache-Control: no-store. Primeiros 35
testes novos: 29 falhas e 6 passes. JWTs e dados privados nunca impressos.

Correção: sendToken remove somente token do JSON, mantendo success/user/status
e cookie F007. Sem campo/header substituto. privateResponse centraliza no-store;
auth chama antes da validação, emissores antes da emissão, logout antes da
revogação. 30 combinações protegidas inventariadas em AUTENTICACAO herdam header,
inclusive 401/403 e erros posteriores. Validações anteriores ao auth não passam
por essa política; não há regra global de cache de erros. Mutações privadas
incluídas; público não recebe no-store incidentalmente por cookie. ETag mantido.
Forgot e erros dos emissores públicos anteriores ao sendToken não foram alterados.

Frontend: actions/reducers/ProtectedRoute/Axios inspecionados. Nenhuma leitura de
JWT da resposta, nenhum Bearer e nenhuma persistência de sessão em storage/Redux.
Não foi necessário mudar código frontend. E2E fortalecido nos quatro fluxos:
JSON sem campos de sessão, no-store, ausência de Authorization e storage sem JWT,
cookie inacessível ao document.cookie. Harness já lia Set-Cookie; agora helper
reutilizável extractCookieValue seleciona nome entre headers, sem log do valor.

### Testes permanentes

Arquivo: `ecommerce/tests/privateResponseSecurity.test.js`.

| ID | Garantia |
| --- | --- |
| PRV-01 | Login sem JWT JSON |
| PRV-02 | Login com cookie HttpOnly/no-store |
| PRV-03 | Cadastro sem JWT, com cookie/no-store |
| PRV-04 | Troca de senha, JWT antigo 401/novo 200 |
| PRV-05 | Reset, JWT antigo 401/novo 200 |
| PRV-06 | Harness captura JWT somente de Set-Cookie |
| PRV-07 | Logout sem JWT, expira cookie, replay 401/no-store |
| PRV-08 | /me privado no-store |
| PRV-09 | /me ausente/inválido 401 no-store |
| PRV-10 | Lista de endereços no-store |
| PRV-11 | Endereço individual no-store |
| PRV-12 | Criação/edição de endereço no-store |
| PRV-13 | Lista de pedidos no-store |
| PRV-14 | Detalhe de pedido no-store |
| PRV-15 | Criação de pedido no-store |
| PRV-16 | Admin usuários no-store |
| PRV-17 | Admin pedidos no-store |
| PRV-18 | Admin produtos no-store |
| PRV-19 | Admin categorias no-store |
| PRV-20 | Catálogo público preservado |
| PRV-21 | Produto público preservado |
| PRV-22 | Cookie no catálogo não impõe no-store |
| PRV-23 | Admin 403 no-store |
| PRV-24 | Erro controlado 500 após auth no-store, sem stack |
| PRV-25 | Quatro emissores sem campos substitutos |
| PRV-26 | Login não revoga sessão existente/tokenVersion |
| PRV-27 | Categorias/reviews públicas com cookie preservadas |
| PRV-28 | Favorito/exclusão de endereço no-store |
| PRV-29 | Review autenticada no-store |
| PRV-30 | Atualização de perfil no-store |
| PRV-31 | Validação privada 400 no-store |
| PRV-32 | Produção preserva Secure/HttpOnly/Lax/Path/host-only |
| PRV-33 | F008 429/Retry-After |
| PRV-34 | F009 recuperação uniforme |
| PRV-35 | F010 autoações 403/no-store |

E2E existente ampliado também cobre login/cadastro/troca/reset sem token JSON,
JWT ausente em localStorage/sessionStorage, cookie inacessível ao JS e navegação
autenticada por cookie. Redux recebe user/success e não recebe JWT.

### Validação

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/privateResponseSecurity.test.js` | 35/35, 9,594 s |
| `npm.cmd test --prefix ecommerce` | 210/210, 23,717 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, Vite 742 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 19/19, 1,8 min |

Audit não reexecutado: sem dependência/lockfile novo. F006/F007/F008/F009/F010
continuam corrigidos, com todas as suítes anteriores verdes. Nenhum incremento
de tokenVersion por remoção do campo; política de cookie e rate limiter intactos.

### Probes finais

| Fluxo | Status | JWT JSON | Cookie | No-store |
| --- | --- | --- | --- | --- |
| Login | 200 | Não | HttpOnly/Secure | Sim |
| Cadastro | 201 | Não | HttpOnly/Secure | Sim |
| Troca de senha | 200 | Não | Novo HttpOnly/Secure | Sim |
| Reset | 200 | Não | Novo HttpOnly/Secure | Sim |
| Logout | 200 | Não | Vazio/expirado | Sim |
| /me | 200 | — | Sessão válida | Sim |
| /addresses | 200 | — | Sessão válida | Sim |
| /orders/me | 200 | — | Sessão válida | Sim |
| /admin/users | 200 | — | Admin válido | Sim |
| /products sem cookie | 200 | — | — | Não |
| /products com cookie | 200 | — | Incidental | Não |

JWT A = <omitido>. Troca e reset: anterior 401, novo 200; logout replay 401.
Produção simulada via headers, sem deployment HTTPS real. Probes mostram apenas
status/atributos/booleanos: nenhuma PII, lista de usuários, cookie completo,
JWT, reset token, senha ou credencial exposta.

### Continuidade

Frontend oficial funcional via cookie; body.token removido propositalmente do
contrato. Clientes externos que dependessem desse campo precisam atualizar.
Sessões existentes não são invalidadas apenas por esta mudança. Reiniciar todas
as instâncias após deploy para carregar política; nenhum processo real reiniciado.
Somente databases temporárias fetech_routes_auth_*, fetech_routes_* e
fetech_e2e_* com teardown. **BANCO REAL NÃO ALTERADO. CONFIG.ENV NÃO SOBRESCRITO
E NENHUM SEGREDO EXPOSTO. AUDITORIA HISTÓRICA NÃO ALTERADA.**

Sem nova collection/schema/dependência ou mudança comercial. Documentos vivos:
README, ROTAS, AUTENTICACAO, ESTADO_ATUAL, COMANDOS e este plano. Fora de escopo:
nenhuma alteração. F020 headers/CSRF/logout POST, F023 TLS/proxy/CDN real,
F025 observabilidade/redaction e F036 env completo permanecem abertos. Logout
ainda GET; Helmet/CSP/HSTS/CSRF não implantados; proxy/CDN reais precisam validar
no-store em staging. Nunca registrar JWT/cookie/senha/reset token em logs/traces.
Próxima task: **F020 / FET-P1-009 — hardening HTTP com Helmet/CSP, proteção
explícita contra CSRF/Origin e migração segura do logout GET para POST.**
Não iniciada automaticamente.

## F020 / FET-P1-009 — Hardening HTTP e CSRF

**Status: CORRIGIDO NO CÓDIGO — FET-SEC-007, 08/10/2026.**

Baseline factual main, HEAD inicial/final
`099e7766802248e617656b0f2fbdfc0849626cde`, worktree inicialmente limpo;
F021 commitada, remediações anteriores preservadas. SEC-007 sem commit.
API baseline 210/210, 24,988 s. Probe anterior: CSP/nosniff/frame/referrer ausentes;
login sem proteção/com Origin hostil/metadata cross-site retornava 200 e emitia
cookie. GET logout retornava 200, limpava cookie e JWT passava a retornar 401.
Test-first: 50 casos, 38 falhas/12 passes antes da correção.

Helmet 8.3.0 consultado no npm, Node >=18 compatível com Node 24/Express 5;
única dependência nova, somente manifest/lockfile backend. Nenhum upgrade
incidental; não executado audit fix. Headers/CSP centralizados em securityHeaders:
API default-src/base-uri/form-action/frame-ancestors none, nosniff, DENY,
Referrer Policy strict-origin-when-cross-origin, COOP/CORP same-origin.
HSTS e upgrade HTTPS desabilitados nesta fase até F023; COEP não habilitado.

Frontend build usa CSP distinta aplicada no host estático E2E; scripts self sem
unsafe-inline/eval, estilos self/unsafe-inline para MUI/Emotion, imagens self/
data/blob/https, connect self, object/frame none. Não é deployment produtivo.
Referência e políticas exatas: [SEGURANCA_HTTP.md](SEGURANCA_HTTP.md) e
[documentação oficial do Helmet](https://helmet.js.org/).

CSRF antes de parsers/uploads/limiter/controllers em /api/v1: header público
X-Fetech-CSRF: 1 em POST/PUT/PATCH/DELETE. Origin normalizada exata e fallback
Referer; sem ambos cliente HTTP com header correto pode prosseguir. Fetch
Metadata presente aceita same-origin/none; cross-site/same-site/inválido 403.
Sem wildcard/Host confiado/CORS permissivo/bypass de teste/JWT no header.
FRONTEND_URL production explícita HTTPS, válida/sem credenciais/wildcard;
falha startup em erro, sem valor exposto. Dev/test permitem duas origins locais
porta 3000 e origin explícita. Não é validação completa de env (F036).

Frontend interceptor Axios padrão antes da renderização cobre actions/dashboard/
categorias/reviews/endereços/checkout e demais consumidores atuais. Apenas
mutações API same-origin recebem header; sem Bearer ou segredo. Logout migrou
para POST. GET/HEAD 405/Allow POST sem DB/cookie/revogação; POST inválido 403
preserva sessão, válido mantém 200/revogação/limpeza/no-store. Clientes externos
precisam adaptar método/header; sessões não revogadas por deploy desta mudança.

### Testes permanentes adicionados

`ecommerce/tests/httpSecurity.test.js`:

| ID | Garantia |
| --- | --- |
| HTTP-01 | Nosniff e remoção X-Powered-By |
| HTTP-02 | CSP API restritiva |
| HTTP-03 | Frame DENY |
| HTTP-04 | Referrer Policy |
| HTTP-05 | POST sem header 403 |
| HTTP-06 | Header correto permite fluxo normal |
| HTTP-07 | Valores incorretos 403 |
| HTTP-08 | Origin cross-site 403 |
| HTTP-09 | Origin configurada permitida |
| HTTP-10 | Ataque prefixo rejeitado |
| HTTP-11 | Ataque sufixo rejeitado |
| HTTP-12 | Origin null rejeitada |
| HTTP-13 | Origin malformada 403, sem 500 |
| HTTP-14 | Referer permitido fallback |
| HTTP-15 | Referer hostil 403 |
| HTTP-16 | Sem Origin/Referer com header permitido |
| HTTP-17 | Fetch Metadata cross-site 403 |
| HTTP-18 | GET público sem CSRF/cache preservado |
| HTTP-19 | GET privado sem CSRF/no-store |
| HTTP-20 | Login browser same-origin/cookie/no-store |
| HTTP-21 | Login cross-site não emite cookie |
| HTTP-22 | Cadastro cross-site não cria User |
| HTTP-23 | Forgot cross-site sem SMTP/token |
| HTTP-24 | Reset cross-site não altera senha/versão/token |
| HTTP-25 | Endereço cross-site não grava |
| HTTP-26 | Pedido cross-site não grava |
| HTTP-27 | Admin cross-site não altera role/categoria/produto |
| HTTP-28 | GET logout 405 sem mutação |
| HTTP-29 | POST logout sem header preserva sessão |
| HTTP-30 | POST logout cross-site preserva sessão |
| HTTP-31 | POST válido revoga, limpa, no-store/replay 401 |
| HTTP-32 | POST logout sem cookie idempotente |
| HTTP-33 | Logout antigo preserva sessão nova |
| HTTP-34 | Cookie de produção F007 |
| HTTP-35 | Limiter F008 429/Retry-After |
| HTTP-36 | Rejeição antes de bcrypt |
| HTTP-37 | Rejeição não consome limiter |
| HTTP-38 | Recuperação uniforme F009 |
| HTTP-39 | Autoações F010 sem mascarar regra |
| HTTP-40 | Login sem JWT JSON/no-store F021 |
| HTTP-41 | OPTIONS sem gate/CORS hostil não liberado |
| HTTP-42 | Todos os métodos inseguros/multipart protegidos |
| HTTP-43 | Path/credenciais/protocolo/porta distintos rejeitados |
| HTTP-44 | Same-site/metadata inválido rejeitado, none permitido |
| HTTP-45 | Produção inválida falha startup, sem secrets |
| HTTP-46 | Allowlists explícitas por ambiente |
| HTTP-47 | HEAD logout não muta |
| HTTP-48 | API desconhecida passa pelo gate |
| HTTP-49 | Host/headers encaminhados não definem allowlist |
| HTTP-50 | Origin precede Referer, fallback inválido/HSTS local |

E2E novo: headers/CSP do host build e estilos Emotion funcionais; produto com
imagem HTTPS fixture e requests API same-origin. Suítes existentes ampliadas:
logout POST/header/no-store e todas as mutações UI com header real, sem injeção
Playwright de CSRF; captura violações CSP por directives/booleanos, sem blockedURI.
Preparação HTTP de fixtures usa helper próprio, separado de requests da UI.

### Validação e probes

| Comando | Resultado |
| --- | --- |
| `node --test ecommerce/tests/httpSecurity.test.js` | 50/50, 14,134 s |
| `npm.cmd test --prefix ecommerce` | 260/260, 26,068 s |
| `npm.cmd run build --prefix ecommerce/frontend` | Aprovado, Vite 829 ms |
| `npm.cmd run test:e2e --prefix ecommerce` | 21/21, 1,8 min, CSP ativa |
| `npm.cmd audit --prefix ecommerce --cache .local/npm-cache` | 0 vulnerabilidades em todas as severidades |

Primeiro E2E interrompido por sintaxe no teste novo; corrigida chave ausente,
limpeza explícita do banco temporário e nova execução. Primeiro foco após
implementação tinha falha do harness ao parsear OPTIONS textual como JSON;
harness agora respeita Content-Type. Nenhuma garantia antiga enfraquecida.

Probes finais omitindo JWT: headers API presentes; sem CSRF 403 sem cookie;
Origin hostil 403; metadata cross-site 403; same-origin 200 sem JWT JSON/no-store.
GET logout 405/Allow POST/cookie intacto, JWT continua 200. POST sem header 403,
JWT continua 200. POST válido 200/cookie vazio/no-store, replay 401.
Origem de teste explícita 127.0.0.1:3300; nenhum TLS/proxy real implantado.

Probe estático adicional sem banco retirou unsafe-inline de style-src no mesmo
build: bloqueios style-src-elem, três tags Emotion. Exceção necessária ao estilo
atual, sem relaxar script-src. E2E final com política escolhida não teve violações.

F006/F007/F008/F009/F010/F021 **CONTINUAM CORRIGIDOS**: suítes completas verdes,
revogação/concorrência/cookie/limiter/forgot/admin/no-store preservados.
Sem coleção/schema/negócio novo. Só databases fetech_routes_auth_*,
fetech_routes_* e fetech_e2e_* com teardown. **BANCO REAL NÃO ALTERADO.
CONFIG.ENV NÃO SOBRESCRITO E NENHUM SEGREDO EXPOSTO. AUDITORIA HISTÓRICA NÃO
ALTERADA.** Nenhum processo real reiniciado; reiniciar APIs e atualizar frontend
juntos após deploy. Fora de escopo: nenhuma alteração.

Documentação viva: SEGURANCA_HTTP, AUTENTICACAO, README, ROTAS, COMANDOS,
DEPENDENCIAS, ESTADO_ATUAL e este plano. Infraestrutura ainda pendente: reproduzir
headers/CSP no hosting/proxy real, validar CSP/HSTS/TLS/origin em staging (F023).
CORS futuro exige revisão CSRF; style unsafe-inline permanece por MUI/Emotion;
novos provedores exigem revisão CSP; observabilidade/redaction completa F025 e
env completo F036 seguem abertos. HSTS produtivo não declarado implantado.
Próxima task: **F036 / FET-P1-019 — validação central e fail-fast das variáveis
de ambiente, secrets e configuração por ambiente.** Não iniciada automaticamente.

## F036 / FET-P1-019 — Validação de configuração (FET-SEC-008)

Status: **CORRIGIDO**.

Estado inicial: branch main; HEAD f2101f4; worktree limpo; F020 já commitada. Probe com dependências interceptadas reproduziu tentativa de conexão Mongo e configuração Cloudinary mesmo sem JWT_SECRET/JWT_EXPIRE, URI Mongo com protocolo inválido e SMTP parcial. Nenhum serviço real foi chamado.

Implementado: inventário real das envs; parser central puro `loadConfig(env)`; ConfigurationError agregado sem valores; snapshot tipado/congelado; validação antes do app, Mongo e listen; regras de produção; grupos SMTP/Cloudinary; config auth/HTTP/timing/rate limit centralizada; perfis server/bootstrap/seed; config.env.example atualizado; inspeção permanente contra leituras dispersas. Nenhuma dependência nova.

F008 e F010 usam constantes internas, sem env artificial. SMTP completo obrigatório em produção; Cloudinary opcional por fallback sem avatar. Parser Mongo usa driver já instalado, sem conexão; exige database explícita e bloqueia test em produção. Contratos e efeitos de compatibilidade: [CONFIGURACAO.md](CONFIGURACAO.md).

Riscos residuais: configuração sintaticamente válida não prova conectividade, quota, permissões ou entrega; SMTP/Cloudinary reais continuam F029; gestão/rotação de secrets depende da infraestrutura F023; observabilidade completa permanece F025; backup/restore permanece F024. Auditoria histórica intacta.

Próxima task recomendada: **F014 / FET-P0-010 — modelo monetário exato em centavos**, antes de mudanças em pedido, estoque e pagamento. Não iniciada automaticamente.

Validação final FET-SEC-008: `node --test ecommerce/tests/configSecurity.test.js` 46/46 (842 ms); `npm.cmd test --prefix ecommerce` 306/306 (37,950 s); `npm.cmd run build --prefix ecommerce/frontend` aprovado (4,00 s); `npm.cmd run test:e2e --prefix ecommerce` 21/21 (2,1 min, exit code 0). Nenhuma dependência/lockfile alterada; npm audit não reexecutado (dispensado pelo escopo). Banco temporário removido pelos harnesses; nenhum e-mail ou upload real; config.env e auditoria histórica preservados; task permanece sem commit.

## F014 / FET-P0-010 — Precisão monetária (FET-DATA-001)

Status: **CORRIGIDO NO CÓDIGO**.

HEAD inicial d3bd5e9, main, worktree limpo; F036 commitada. Probe prévio em banco temporário reproduziu preço 0.105 aceito, quantidade 3, snapshot 0.105, linha 0.315 e subtotal/total 0.33. Banco temporário removido.

Implementado: utilitário compartilhado estrito, dinheiro canônico em Cents safe integer; Product, snapshots e totais Order; invariantes antes de save; preço autoritativo do servidor; filtros existentes; frontend em centavos; localStorage legado seguro/removível; decimais somente apresentação; migração dry-run/apply com confirmação, sanitização, idempotência e proteção contra mudanças concorrentes. Precisão arbitrária nunca é arredondada. Nenhuma dependência nova.

Banco real não migrado. Riscos: backup/restore F024 deve ser validado antes de migração produtiva; dados históricos ambíguos exigem revisão; coerência comercial F037, pagamento F001, frete F027, estoque/atomicidade F003/F004 e idempotência F005 permanecem abertos. A auditoria histórica foi preservada.

Próxima recomendação: **F012 + F013 — snapshot de entrega com CEP/telefone strings e validações de checkout**. Não iniciada automaticamente.

Validação FET-DATA-001: 28/28 money, 23/23 API monetária, 16/16 migração; 373/373 API completa (27,485 s); build aprovado (959 ms); 24/24 E2E (1,9 min, exit 0); git diff --check aprovado. Sem pacote novo/lockfile alterado. Migração real não executada; implementação permanece sem commit. Relatório: [RELATORIO_FET_DATA_001.md](RELATORIO_FET_DATA_001.md).

## F012 / FET-P1-003 — CEP/telefone do Order — FET-DATA-002

**Status: CORRIGIDO NO CÓDIGO.** F014 já estava commitado em `64d11ae` antes desta tarefa.

Novos pedidos preservam CEP/telefone strings e zeros iniciais no snapshot
estruturado completo, versão 2. Edição, exclusão e favorito de Address não
alteram Order. Histórico continua legível e com atualização de status válida,
sem reconstrução artificial de zeros. Audit READ ONLY identifica dados
numéricos, campos ausentes e formatos inválidos sem PII.

Risco residual: zeros perdidos podem exigir fonte externa ou ser irrecuperáveis;
banco real não auditado. F024 backup/restore deve preceder alterações históricas.

## F013 / FET-P1-004 — Validação de checkout — FET-DATA-002

**Status: CORRIGIDO.** Strings obrigatórias exigem tipo real, trim, texto não
vazio e limites do Address. CEP: 8 dígitos; telefone: 10–15 dígitos. Quantity:
Number inteiro seguro positivo, sem coerções. Boolean/string/float/zero/negativo
rejeitados. Array e IDs validados antes de consultas/cálculos. Payload inválido
não cria Order, muda estoque/Address/favorito ou envia e-mail. Endereço manual
e salvo compartilham contrato canônico; a agenda conserva seu adaptador de pontuação.

F006/F007/F008/F009/F010/F014/F020/F021/F036 continuam corrigidos no código.
F001, F003, F004, F005, F024, F027, F031 e F037 permanecem abertos.
Validação: 113/113 checkout, 11/11 audit, 497/497 API, build aprovado, 25/25 E2E,
git diff --check aprovado. Sem dependência/lockfile/secret/config.env alterado.
Banco real não auditado/modificado; auditoria original intacta; sem commit nesta entrega.
Detalhes: [VALIDACAO_CHECKOUT.md](VALIDACAO_CHECKOUT.md) e
[RELATORIO_FET_DATA_002.md](RELATORIO_FET_DATA_002.md).

Próxima recomendação: **F005 — idempotência persistente na criação de pedidos**.
Não iniciada automaticamente.

## F005 / FET-P0-005 — Idempotência de criação de Order — FET-ORDER-001

**Status: CORRIGIDO.** FET-DATA-002 já commitado em `22012da`; worktree inicial limpo.

Idempotency-Key obrigatória, hash sem key bruta e fingerprint canônico versionado.
Claim PROCESSING persistente Mongo, unique user/operation/keyHash, sem TTL/lease.
Same key/user/request retorna mesmo Order; payload diferente retorna 409; nova
key é outra intenção. Order possui hashes internos e índice unique parcial,
compatível com legados. Concorrência em conexões e processos distintos não duplica.
Raw key/PII não entram no claim; hashes não aparecem na API.

PROCESSING com Order é reconciliado automaticamente; falha ao marcar COMPLETED
é recuperável. PROCESSING sem Order e FAILED permanecem fail-closed, sem retomada
automática por tempo. Registro concluído continua bloqueando recriação após
exclusão física do Order. Frontend usa UUID seguro/sessionStorage, mantém key
após rede/5xx/409/reload, limpa no sucesso e muda key apenas para draft diferente
no próximo submit explícito.

F006/F007/F008/F009/F010/F012/F013/F014/F020/F021/F036 continuam corrigidos.
F003 concorrência entre intents, F004 atomicidade, F001 pagamento, F011 exclusão
física, F024 backup/restore e F027 frete permanecem abertos. PROCESSING órfão
sem Order exige futura reconciliação; retenção comercial indefinida, sem TTL;
pagamento terá idempotência/webhooks próprios e observabilidade será ampliada.

Sem dependências/lockfiles/config.env/secrets alterados; banco real não alterado;
auditoria histórica intacta. Contrato: [IDEMPOTENCIA_PEDIDOS.md](IDEMPOTENCIA_PEDIDOS.md).
Relatório: [RELATORIO_FET_ORDER_001.md](RELATORIO_FET_ORDER_001.md).
Validação final: 39/39 backend, 9/9 frontend, 545/545 API, build aprovado,
27/27 E2E e git diff --check aprovado. Implementação permanece sem commit.

Próxima recomendação: **F003 + F004 — reserva/ledger de estoque e atomicidade
durável entre pedido e estoque**, para overselling/estados parciais.
Não iniciadas automaticamente.


## F003 / FET-P0-003 — Overselling de estoque

**Status: CORRIGIDO.** FET-ORDER-002, 08/10/2026, branch main,
HEAD base c87c840d99deb8b3220e9a0bd3b831a7e79d75d9. Implementação sem commit nesta entrega.
Stock representa disponibilidade; reserva usa condição Stock >= quantity e
$inc dentro de Mongo transaction. Inteiros seguros não negativos, revalidação
no snapshot e produtos ordenados. Stock=1/duas intents cria um pedido;
Stock=5/dez intents cria cinco. Replay não reserva novamente.

## F004 / FET-P0-004 — Atomicidade Order/Stock

**Status: CORRIGIDO para novos pedidos transacionais.** Product.Stock,
StockMovement RESERVE, Order RESERVED e claim COMPLETED commitam/abortam juntos.
Servidor exige replica set/mongos antes de listen; sem fallback. Testes usam
Mongo real isolado, falhas em cada etapa, write conflict, commit desconhecido
e crash de processo. Legados mantêm o fluxo anterior, sem migrar histórico.

Riscos: reservas Pending sem release/commit comercial; F001/F002/F028 abertos;
guarda DELETE RESERVED não fecha F011. Product legacy inválido exige revisão,
catalog lifecycle permanece e backup/restore F024 não está validado.
Referências: [estoque transacional](ESTOQUE_TRANSACIONAL.md) e
[relatório FET-ORDER-002](RELATORIO_FET_ORDER_002.md).
Próxima recomendação: F011; não iniciar automaticamente.


## FET-ORDER-003 — histórico comercial preservado (08/10/2026)

F011 / FET-P0-009 corrigido. DELETE administrativo de qualquer pedido retorna 405 com Allow: PATCH; não há exclusão física no fluxo comercial. PATCH /api/v1/admin/order/:id/archive e /unarchive são exclusivos para admin, com CSRF e metadata atômica. O painel filtra Ativos (padrão), Arquivados e Todos. Cliente mantém histórico completo, sem metadata administrativa. Arquivamento preserva centavos, snapshot, pagamento, estoque, ledger e replay. Pedidos legados não exigem migração. Auditoria somente leitura: npm.cmd run audit:orders --prefix ecommerce.

Detalhes: [Histórico de pedidos](HISTORICO_PEDIDOS.md) e [Relatório FET-ORDER-003](RELATORIO_FET_ORDER_003.md). F002 é a próxima recomendação, sem início automático.


## F002 / FET-P0-002 — Envio antes da confirmação do pagamento

Status: CORRIGIDO pela FET-ORDER-004 (08/10/2026). Novos Orders nascem paymentStatus=PENDING dentro da transação. Processing→Shipped e Shipped→Delivered exigem PAID e paidAt BSON Date válido; saltos e retrocessos retornam409. Mesmo estado é idempotente, target inválido400. Atualização condicional atômica/CAS preserva Stock, ledger, idempotência e archive. Cliente/admin não conseguem forçar PAID por payload; legado sem estado confiável é UNVERIFIED sem migração. UI separa pagamento do status comercial e bloqueia envio sem confirmação.

Até F001 nenhum endpoint confirma pagamento: novos pedidos permanecem bloqueados para expedição. Reservas Pending continuam consumindo Stock; cancel/release/refund permanecem F028. Históricos já enviados sem confirmação exigem auditoria/revisão, sem reparo automático. audit:orders foi estendido em modo somente leitura.

Documentação: [Estados do pedido e pagamento](ESTADOS_PEDIDO_PAGAMENTO.md) e [Relatório FET-ORDER-004](RELATORIO_FET_ORDER_004.md). Próxima recomendação: F001; não iniciada automaticamente.
# Atualização de status — FET-MEDIA-001 (09/10/2026)

F018 **CORRIGIDO NO CÓDIGO**. F019 **CORRIGIDO NO CÓDIGO PARA NOVAS SUBSTITUIÇÕES**. Upload multipart validado, ledger durável, CAS e cleanup reconciliável substituem avatar string/upload sem compensação. Assets históricos fora do namespace não são removidos automaticamente. [Relatório](RELATORIO_FET_MEDIA_001.md).

F002–F017, F020, F021, F025 e F036 continuam corrigidos. F024 continua parcial; F029 continua aberto sem validação Cloudinary real; F030 permanece aberto. F001/pagamento e F027/frete não iniciados. Auditoria histórica preservada. Próxima recomendação: F031, tolerância a corrupção/migração de localStorage e Error Boundary; não iniciar automaticamente.
## F031 — Corrupção de storage derruba frontend

Status: **CORRIGIDO NO CÓDIGO**, FET-FRONT-001 (09/10/2026).

Inventário central de localStorage/sessionStorage, parsing seguro e validação estrutural pós-JSON; versões/migrações explícitas, defaults por key e ausência de clear genérico. F005 commercial recovery não é apagada genericamente: attempt deve ser persistida antes do POST; sessionStorage indisponível bloqueia compra. Corrupção exige revisão/confirmar, sem auto-submit ou nova key automática. Reducers puros; Error Boundary global e bootstrap defensivo mostram fallback sem stack, com reload e reset apenas de tema. E2E cobre corrupção anterior ao bootstrap.

Limites: boundary não captura automaticamente handlers/async; estado local não substitui backend; sem monitoramento externo. [Documentação](PERSISTENCIA_FRONTEND.md) e [relatório](RELATORIO_FET_FRONT_001.md). F002–F018, F020/F021/F025/F036 continuam corrigidos; F019 corrigido para novas substituições. F024 parcial; F029/F030/F037 abertos; F001/F027 adiados. F033/F034 não tratados. Próxima recomendação F037, não iniciada automaticamente. Auditoria histórica intacta.
