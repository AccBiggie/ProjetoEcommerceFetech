# Estado atual — ProjetoEcommerceFetech

## F016 — Lifecycle seguro de User — FET-DATA-003

**CORRIGIDO NO CÓDIGO** (08/10/2026): DELETE físico de User retorna 405; model/runtime bloqueia deletes. Lifecycle ACTIVE/DEACTIVATED com metadata técnica; desativação revoga sessões/recuperação e mantém identidade/referências, reativação exige novo login. Auth verifica status e versão; F010/CLI contam somente admins ativos. Transições e eventos F025 são atômicos. Dashboard oferece status, filtros e desativar/reativar. Auditoria audit:users é somente leitura.

Validação: focused96/96, API918 aprovados/15 skips exclusivos F024, build aprovado, E2E32/32 e diff aprovado. [Relatório](RELATORIO_FET_DATA_003.md), [contrato](LIFECYCLE_USUARIOS.md), [testes individuais](TESTES_FET_DATA_003.md).

**Limites:** PII permanece armazenada; anonimização/privacy erasure pertence a F030. Órfãos históricos não foram reparados; qualquer reparo real depende de F024 validado. F024 permanece **PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE**, sem download/drill real. F001/F027 continuam adiados. Banco real/config.env/auditoria histórica preservados; tarefa sem commit. Próxima recomendação **F015 — consistência concorrente de reviews**, sem início automático. Este status corrente prevalece sobre recomendações históricas abaixo.


## Atualização FET-OPS-002 — 08/10/2026

F025 **CORRIGIDO NO CÓDIGO**: request ID server-side/response header, AsyncLocalStorage, logs JSON com níveis e redaction, rota template segura, live/ready e audit administrativo append-only implementados. Mutações Mongo e evento são transacionais; read API admin-only paginada e aba Auditoria no dashboard. Sem dependência/collector externo, sem TTL até F030. Validação: focused116/116, API822 aprovados/15 skips F024, build aprovado, E2E31/31, diff aprovado. Evidências finais: [relatório](RELATORIO_FET_OPS_002.md); contrato: [OBSERVABILIDADE.md](OBSERVABILIDADE.md).

F024 permanece **PARCIAL / AGUARDANDO MONGODUMP + MONGORESTORE**; nenhuma ferramenta baixada nesta tarefa. F001/F027 adiados; banco real/config.env/auditoria histórica preservados. Próxima recomendação F016, sem início automático. Esta atualização prevalece sobre recomendações anteriores abaixo.

## Atualização FET-OPS-001 — 08/10/2026

**F024 / FET-P0-012 PARCIAL — VALIDAÇÃO REAL BLOQUEADA.** CLIs `backup:db`, `restore:db` e `verify:backup` implementadas com tools oficiais, archive gzip, manifesto/checksums, destino novo e verificação de dados/índices/relações. Exige replica set e janela sem escrita verificada pelo oplog; não oferece PITR ou snapshot online com escrita contínua. Database Tools ausentes; usuário escolheu não baixar. Nenhum backup/restore/drill real foi executado, RTO não medido.

API: 706 aprovados, 15 skipped de integração com tools; build aprovado; E2E 30/30. Banco comercial/config.env/auditoria histórica preservados. Sem commit nesta entrega. F002/F003/F004/F005/F011 e remediações anteriores preservadas. F001 e F027 adiados pelo usuário, não iniciados. Próxima recomendação F025 (observabilidade), sem início automático.

Contrato atualizado: [BACKUP_RESTORE.md](BACKUP_RESTORE.md); evidências/limitações: [RELATORIO_FET_OPS_001.md](RELATORIO_FET_OPS_001.md). Esta atualização prevalece sobre recomendações históricas abaixo.

FET-ORDER-002: F003/F004 corrigidos para novos pedidos. Reserva condicional e
trilha StockMovement, pedido RESERVED e idempotência COMPLETED são atômicos.
API exige Mongo transacional, testes usam replica set isolado e banco real
permanece intacto. Validação atual: 51/51 focados, 596/596 API, build aprovado,
28/28 E2E. Mudanças sem commit. [Relatório](RELATORIO_FET_ORDER_002.md).

FET-ORDER-001: criação de pedidos com Idempotency-Key obrigatória e persistência
MongoDB, hashes canônicos, índices únicos, replay e reconciliação de Order salvo.
Frontend preserva tentativa entre retries/reload. PROCESSING sem Order falha
fechado. F003/F004 foram tratados pela FET-ORDER-002 com reserva transacional.
Contrato: [IDEMPOTENCIA_PEDIDOS.md](IDEMPOTENCIA_PEDIDOS.md).
Validação: 39/39 backend, 9/9 frontend, 545/545 API, build aprovado e 27/27 E2E.
Banco real não alterado; F005 commitada em `c87c840`. Relatório da entrega anterior:
[RELATORIO_FET_ORDER_001.md](RELATORIO_FET_ORDER_001.md).

FET-DATA-002: entrega versionada completa, CEP/telefone strings, quantities
estritas e diagnóstico histórico READ ONLY. Novos pedidos preservam zeros;
pedidos antigos continuam legíveis e atualizáveis sem inventar dados perdidos.
Validação: 113/113 checkout, 11/11 audit, 497/497 API, build aprovado, 25/25 E2E.
Banco real não auditado/modificado. F014 preservado no commit `64d11ae`.
Contrato: [VALIDACAO_CHECKOUT.md](VALIDACAO_CHECKOUT.md).
Entrega: [RELATORIO_FET_DATA_002.md](RELATORIO_FET_DATA_002.md).

Referência em 08/10/2026 para continuidade do projeto. O código e os lockfiles
são as fontes de verdade; atualizar este documento ao mudar os contratos.

## Arquitetura

A Fetech é uma loja de hardware e tecnologia com React 19, Vite 8, Material UI 9,
React Router 8, Redux/Thunk e Axios no frontend. A API usa Node 24, Express 5,
Mongoose 9 e MongoDB. A autenticação usa JWT no cookie `token` e autorização
no servidor. As dependências instaladas estão detalhadas em `DEPENDENCIAS.md`.

Após FET-SEC-001, `User.tokenVersion` é persistido e incluído em todo JWT.
O middleware compara a versão e rejeita JWTs legados, inválidos ou revogados.
Logout revoga globalmente a versão atual com incremento atômico condicional;
troca/reset salvam senha e versão juntas e emitem novo JWT. Replay de logout
antigo e logouts simultâneos não derrubam sessões posteriores. Usuários antigos
sem campo persistido usam default zero, sem backfill obrigatório; tokens antigos
sem claim são rejeitados e exigem novo login após deploy. Sessões por dispositivo
e MFA continuam pendentes. Cookie Secure em produção corrigido na FET-SEC-005;
hardening HTTP/CSRF corrigido no código na FET-SEC-007. HTTPS/HSTS reais pendentes.
Detalhes em [AUTENTICACAO.md](AUTENTICACAO.md) e
[PLANO_MELHORIAS_FETECH.md](PLANO_MELHORIAS_FETECH.md).

FET-SEC-002 adiciona rate limiting distribuído em `authratelimits`, MongoDB:
login por IP/conta/conta+IP, recuperação por IP/conta, reset e cadastro por IP.
Políticas centralizadas, HMAC para chaves, reservas atômicas antes de bcrypt,
expiração lógica, TTL e 429 com `Retry-After`. Não há Redis, fallback em memória,
lock permanente ou confiança automática em X-Forwarded-For. Falha do limiter
retorna 503. F006 permanece protegido; F009 foi corrigido em FET-SEC-003.
Recuperação responde 200 genérico para conta existente/inexistente e falha SMTP,
limpa token não enviado e usa piso temporal assíncrono opcional de 300 ms.
SMTP externo ainda pode variar o tempo; F040 tratará outbox/processamento assíncrono.

Desenvolvimento local: frontend `http://localhost:3000`, API em
`127.0.0.1:4000/api/v1` e MongoDB em `127.0.0.1:27017`, banco `fetech`.
O Vite encaminha `/api` para a API. A API só abre a porta após conectar ao banco
e preparar os índices. Ver `COMANDOS.md` para instalação e início no PowerShell.
Segredos ficam em `ecommerce/backend/config/config.env`, ignorado pelo Git.

## Funcionalidades existentes

- Catálogo, busca, filtros, paginação, galeria e avaliações.
- Cadastro, login, perfil, senhas e recuperação por e-mail.
- Carrinho persistido em `localStorage` e checkout com criação de pedido.
- Pedidos do cliente, consulta do snapshot e administração de status/estoque.
- Dashboard administrativo de produtos, usuários, pedidos e categorias.
- Categorias com CRUD próprio, hierarquia por `parent_id` e produtos por
  `category_id`. Formulário de categorias em offcanvas; filtros incluem filhos.
- Tema claro/escuro, preferência do sistema e escolha persistente no navegador.
- Cadastro persistente de múltiplos endereços da própria conta, com CRUD,
  favorito único e autorização por proprietário.
- Cards de endereços cadastrados na entrega, preenchendo os campos atuais
  de forma editável e mantendo a alternativa manual.

## Endereços: atualização desta tarefa

O domínio `Address` usa coleção própria, referência obrigatória a `User`,
identificação, destinatário, logradouro, número, complemento, bairro, cidade,
estado, país, CEP, telefone, favorito e timestamps. CEP e telefone são strings
normalizadas, preservando zeros iniciais. Há índice único parcial para
garantir no máximo um favorito por usuário.

Rotas autenticadas: `GET /addresses`, `POST /address/new`,
`GET/PUT/DELETE /address/:id` e `PUT /address/:id/favorite`, sob `/api/v1`.
Todos os acessos são limitados ao usuário da sessão, inclusive para admin;
IDs de outra conta retornam 404. O proprietário enviado pelo cliente é ignorado.

Tela `/addresses`, carregada sob demanda e protegida, acessível em
**Meus endereços** no perfil e no menu **Minha conta**. Usa cards, chip de
favorito, Drawer para cadastro/edição e confirmação de exclusão, respeitando
o tema compartilhado. Estado local com Axios centralizado em `addressApi.js`.
Detalhes de campos, endpoints e regras estão em [ENDERECOS.md](ENDERECOS.md).

## Regras a preservar

O checkout atual mantém seu endereço em `localStorage.shippingInfo`. O pedido
mantém `Order.shippingInfo` como snapshot completo com `shippingInfoVersion: 2`,
strings e validação estrita conforme [VALIDACAO_CHECKOUT.md](VALIDACAO_CHECKOUT.md).
Os cards na entrega copiam os dados de `Address` para os campos editáveis do
formulário, sem selecionar um endereço automaticamente. O endpoint do pedido
recebe os dados finais, preservando o snapshot. Editar um campo passa a indicar
preenchimento manual. Pedidos não dependem permanentemente de `Address`, e
editar/excluir o cadastro não altera snapshots existentes. Falha ao consultar
os cards permite continuar com preenchimento manual.

Pedidos são criados com pagamento `Pending`, sem cobrança, frete ou impostos
integrados. Novos pedidos reservam disponibilidade em Mongo transaction:
Product.Stock + StockMovement RESERVE + Order RESERVED + claim COMPLETED.
O servidor exige replica set/mongos, sem fallback standalone. Shipping não
desconta novamente; DELETE RESERVED retorna 409. Legados sem inventário
mantêm o fluxo anterior. Reservas Pending não expiram e aguardam futuro
pagamento/cancelamento. [Contrato de estoque](ESTOQUE_TRANSACIONAL.md).

SMTP e Cloudinary dependem de credenciais reais; os testes usam substituições
isoladas. Não há gateway de pagamento, transportadora, frete, rastreamento
ou publicação de produção confirmada nesta referência.

## Continuidade e verificação

Usar componentes Material UI, tema compartilhado, português, BRL, rotas
existentes e middleware de autenticação. Não expor segredos ou executar testes
destrutivos no banco real. Usar bancos temporários existentes para testes.

Comandos obrigatórios: `npm.cmd test --prefix ecommerce`,
`npm.cmd run build --prefix ecommerce/frontend` e
`npm.cmd run test:e2e --prefix ecommerce`. A suíte atual contém 545 testes da
API e 27 fluxos E2E, incluindo endereços e seleção na entrega em 360, 768 e
1440 px e modo escuro.

Resultado após integrar a seleção de endereços na entrega (antes de FET-SEC-001): **13 testes da API
aprovados, build aprovado e 19 testes E2E aprovados**, em 07/10/2026.

Resultado de FET-SEC-001 em 07/10/2026: **28/28 testes focados, 41/41 testes
da API, build aprovado e 19/19 E2E**. Testes e probes executados exclusivamente
em bancos temporários com teardown; banco real não alterado. JWTs antigos
sem versão exigirão novo login quando a nova API for iniciada.

Resultado final de FET-SEC-002 em 07/10/2026: **35/35 testes focados do
limiter, 76/76 testes da API, build aprovado e 19/19 E2E**. F006 permanece
corrigido e F008 foi remediado. Nesse registro, F009 ainda estava aberto. As alterações desta task
permanecem no worktree; carregar a implementação exige reiniciar a API.

Documentos complementares: `README.md`, `COMANDOS.md`, `ROTAS.md`, `FRONTEND.md`,
`DEPENDENCIAS.md` e `docs/ENDERECOS.md`.

## Recuperação sem enumeração — FET-SEC-003

F009 / FET-P1-001 corrigido em 07/10/2026. Contrato de `POST /password/forgot`:
HTTP 200, `{success:true,message:"Se existir uma conta associada a este e-mail,
enviaremos as instruções para redefinição de senha."}` para existente,
inexistente e SMTP ausente/falho. Não confirma envio ou existência. Inexistente
não cria conta/recuperação nem envia e-mail. Falha de envio limpa hash/expiração
com condição pelo hash gerado, registra apenas evento constante seguro e mantém
resposta genérica. Falhas estruturais seguem middleware; limiter indisponível
permanece 503. Quota excedida continua 429 com Retry-After antes do controller.

Piso opcional `AUTH_FORGOT_MIN_RESPONSE_MS`, default 300 ms, 20 ms nos testes.
Timer assíncrono com relógio monotônico, sem busy-wait. SMTP externo lento pode
ultrapassar o piso; processamento assíncrono/outbox continua reservado a F040.
Forgots concorrentes ainda podem substituir links anteriores; limpeza antiga
não apaga token mais recente. A UI existente apresenta a mensagem genérica e
mantém 429/erros globais. Revogação JWT e reset single-use permanecem protegidos.

Validação: 25/25 testes focados, 101/101 API, build aprovado e 19/19 E2E. Probes finais
retornaram corpos/status iguais; token limpo em falha; sexta tentativa 429.
Timing local com cinco amostras por caso: medianas 325,94 ms (existente) e
325,51 ms (inexistente). Isso não comprova resistência absoluta a timing attacks
em produção. Banco real não alterado, nenhum e-mail real enviado, configuração
real preservada e auditoria histórica não alterada. Mudanças de F008 preservadas;
F008/F009 continuam no worktree sem novo commit. Carregar o novo código exige
reiniciar a API; processos antigos não foram reiniciados nesta task.

Próxima task recomendada: F010 / FET-P1-002, proteção do último administrador,
autoexclusão/autorrebaixamento e bootstrap seguro; não iniciada automaticamente.

## Segurança administrativa — FET-SEC-004

F010 / FET-P1-002 corrigido em 08/10/2026. Backend bloqueia autoexclusão e
autorrebaixamento administrativos (403), protege último admin (409), recarrega
executor sob lock e preserva operações legítimas sobre outros usuários/admins.
Mutações serializadas pelo singleton `adminmutationlocks`, com owner aleatório,
lease de 10 s pelo relógio MongoDB, liberação condicionada e geração crescente.
`User.adminMutationFence` oculta condiciona escritas e rejeita operações antigas
após aquisição nova. Bootstrap reserva um ID para impedir criação duplicada
inclusive após expiração de lease. Sem replica set obrigatório ou mutex local.

CLI `npm.cmd run admin:bootstrap --prefix ecommerce`: terminal interativo,
zero admins, confirmação exata da database, nome/e-mail novo e senha oculta.
Sem senha padrão, argumentos de senha, endpoint HTTP ou promoção automática.
Criação reutiliza validações/hook bcrypt e avatar default, sem SMTP/Cloudinary.
Login normal após criação; F006/F008/F009 preservados. Seed de produtos locais
usa admin existente sem e-mail fixo. Dashboard exibe erros 403/409 e mantém
ações próprias desabilitadas. Detalhes em [ADMINISTRACAO.md](ADMINISTRACAO.md).

Baseline factual: branch main, HEAD `101f61be501d266dcf7ae609181498fee5440803`,
worktree inicialmente limpo. F008/F009 já estavam commitados; referência do
anexo ao HEAD anterior/worktree pendente foi substituída por essa verificação.
FET-SEC-004 foi posteriormente commitada em `069e589`. Validação daquela task:
41/41 testes focados, 142/142 API,
build aprovado e 19/19 E2E. Probes: autoações 403, contagem preservada em 1,
concorrência 403/200 com um admin restante, bootstrap 0→1 e login 200,
repetição recusada 409.
Banco real não alterado; configuração e auditoria histórica preservadas.
Reiniciar todas as instâncias para carregar o código; não manter APIs antigas
processando mutações administrativas. Nenhum processo real reiniciado na task.

F016 (lifecycle/relações órfãs), F025 (trilha administrativa), MFA e RBAC granular
permanecem pendentes. A recomendação daquele encerramento era F007, agora
implementada pela FET-SEC-005 abaixo; deployment TLS permanece em F023.

## Cookie de autenticação — FET-SEC-005

F007 / FET-P0-007 corrigido em 08/10/2026. Início: main, HEAD
`069e589d00572ec79af33159d1b2c218d13ef5e0`, worktree limpo e F010 commitada.
SEC-005 foi posteriormente commitada em `5a9e4ec`.

Política centralizada em authCookie: token host-only, HttpOnly, SameSite=Lax,
Path=/ e Secure obrigatório em NODE_ENV=production. Development/test mantêm
HTTP; ambiente desconhecido não é produção e precisa ser configurado exatamente.
COOKIE_EXPIRE positivo/finito/data futura é validado no startup e emissão;
7 dias preservados. Logout limpa atributos iguais via clearCookie e mantém
revogação F006. Todos os emissores usam sendToken; JWT no JSON foi posteriormente
removido pela FET-SEC-006.

TRUST_PROXY_HOPS ausente/0 mantém false; 1..5 exige topologia conhecida e
headers saneados. Inválido impede startup. Default segue resistente a spoof;
probe da sexta falha retorna 429 e Retry-After=900. App isolado com hops=1
confirma configuração 1; teste confirma resolução direita→esquerda da cadeia.

Validação: 33/33 testes focados, 175/175 API, build aprovado e 19/19 E2E.
Browser verifica cookie e remoção real após
logout; produção simulada verifica atributos, sem TLS implantado. Probes:
Secure false em development/true em production, HttpOnly/Lax/Path consistentes,
logout expirado e replay 401. F006/F008/F009/F010 continuam corrigidos.

Sem novas dependências/coleções/schema. Config.env, auditoria histórica e banco
real preservados; testes somente em bancos temporários com teardown. Reiniciar
todas as APIs para carregar a política; nenhum processo real reiniciado.
Naquele encerramento F020/F021/F023/F036 permaneciam abertos. HTTPS/TLS/proxy real, HSTS/Helmet/CSP,
CSRF explícito e validação completa de env não foram implementados.
F021 foi a próxima recomendação e está implementada na seção abaixo.

## Respostas privadas — FET-SEC-006

F021 / FET-P1-010 corrigido em 08/10/2026. Baseline main, HEAD
`5a9e4ec41a10fe16630d41af355fac476f3bedb5`, worktree limpo, F007 commitada.
SEC-006 foi posteriormente commitada em `099e776`. F006/F007/F008/F009/F010 preservados.

JWT removido do JSON dos quatro emissores; sessão transportada pelo cookie
HttpOnly. Frontend não depende de body.token/Bearer nem persiste JWT. No-store
centralizado em auth (antes da validação), sendToken e logout. Todas as 30
combinações protegidas herdam header, inclusive 401/403 e erros posteriores;
rotas públicas preservadas, mesmo com cookie. ETag global mantido.
Harness extrai JWT somente do Set-Cookie; helper reutilizável seleciona nome.
Clientes externos dependentes de body.token precisam adaptar; sessões existentes
não são revogadas apenas por esta alteração. Reiniciar APIs após deploy.

35/35 testes focados, 210/210 API, build aprovado e 19/19 E2E.
Probes confirmam ausência de body.token, cookies HttpOnly/Secure em produção
simulada, no-store privado, replay 401 e sessão rotacionada 200. Catálogo público
sem no-store com/sem cookie. Browser verifica respostas e storage sem expor JWT.

Sem nova dependência/coleção/schema, banco real não alterado, config.env e
auditoria histórica preservados. Nenhum processo real reiniciado. F020 era a
próxima recomendação e está implementada no código na seção abaixo.

## Hardening HTTP e CSRF — FET-SEC-007

F020 / FET-P1-009 **CORRIGIDO NO CÓDIGO** em 08/10/2026. Início factual:
main, HEAD `099e7766802248e617656b0f2fbdfc0849626cde`, worktree limpo, F021
commitada. SEC-007 sem commit; HEAD mantido e remediações anteriores preservadas.

Helmet 8.3.0 (única dependência nova) na API: CSP restritiva, nosniff, DENY,
Referrer Policy e políticas COOP/CORP same-origin. CSP distinta do build aplicada
ao host E2E; scripts somente self, estilos inline para MUI/Emotion, imagens HTTPS,
connect self. Não confundir host E2E com deployment: HSTS/TLS/hosting real na F023.

CSRF global ao prefixo API para métodos inseguros, antes dos parsers e limiter:
header fixo X-Fetech-CSRF: 1, comparação exata de Origin/Referer, Fetch Metadata
same-origin/none; hostil/null/inválido/same-site rejeitados 403. Sem origin,
header permite cliente HTTP não-browser. Nenhum CORS permissivo/bypass de teste.
FRONTEND_URL explícito HTTPS em production obrigatório, validado no startup.

Frontend interceptor cobre todos os consumidores Axios atuais. Logout POST;
GET/HEAD 405/Allow POST sem mutação; POST inválido preserva sessão, válido
revoga/limpa/no-store. Clientes externos devem enviar header e migrar logout.
F006/F007/F008/F009/F010/F021 continuam corrigidos. Políticas completas em
[SEGURANCA_HTTP.md](SEGURANCA_HTTP.md); resultados no plano de melhorias.

Validação final: 50/50 focados, 260/260 API, build aprovado, 21/21 E2E sob CSP
e audit backend com zero vulnerabilidades. Browser confirma estilos Emotion,
imagem HTTPS fixture, requests same-origin e header CSRF nas mutações reais.

Banco real/config.env/auditoria histórica preservados. Testes temporários com
teardown, sem novas coleções/schema ou mudanças comerciais. Reiniciar todas
as APIs e atualizar frontend juntos após deploy; nenhum processo real reiniciado.
No encerramento FET-SEC-007, F023/F025/F036 continuavam abertos; F036 está tratado na seção FET-SEC-008 abaixo.

## FET-SEC-008 — configuração central

F036/FET-P1-019 corrigido. Estado inicial: main, HEAD f2101f4, worktree limpo; F020 já commitada. `runtimeConfig.js` inventaria e valida as 17 variáveis do backend. E2E_BROWSER permanece configuração exclusiva do runner, documentada à parte. Valores tipados/congelados alimentam auth, cookie, proxy, CSRF, timing e providers. Startup falha com erro agregado seguro antes de Mongo/listen. Perfis server/bootstrap/seed evitam exigir configuração HTTP nos scripts de manutenção.

Production exige secret forte, expiração, database explícita, origin HTTPS e SMTP completo. Cloudinary opcional preserva cadastro sem foto e rejeita grupo parcial. config.env real e auditoria histórica foram preservados. Contrato completo: [CONFIGURACAO.md](CONFIGURACAO.md). Implementação permanece sem commit até solicitação do usuário.

Validação FET-SEC-008: 46/46 focados (842 ms), 306/306 API (37,950 s), build aprovado (4,00 s), 21/21 E2E (2,1 min, exit code 0). Sem mudança de dependências/lockfiles; npm audit não reexecutado nesta tarefa.

## FET-DATA-001 — dinheiro em centavos

F014 corrigido no código. Estado inicial: main, HEAD d3bd5e9, worktree limpo; F036 já commitada. Product e Order usam campos Cents safe integer como fonte persistida. API mantém decimais derivados para compatibilidade; frontend calcula/formata centavos. Parser rejeita precisão >2 casas e overflow. Leitura legada estrita sinaliza moneyLegacy e não escreve automaticamente. Migração explícita com dry-run padrão, confirmação de database e CAS por documento; testada apenas em bases temporárias. Banco real e auditoria histórica preservados. Contrato: [DINHEIRO.md](DINHEIRO.md), operação: [MIGRACAO_DINHEIRO_CENTAVOS.md](MIGRACAO_DINHEIRO_CENTAVOS.md).

Validação FET-DATA-001: 28/28 money, 23/23 API monetária, 16/16 migração; 373/373 API completa (27,485 s); build aprovado (959 ms); 24/24 E2E (1,9 min, exit 0); git diff --check aprovado. Sem pacote novo/lockfile alterado. Migração real não executada; implementação permanece sem commit. Relatório: [RELATORIO_FET_DATA_001.md](RELATORIO_FET_DATA_001.md).


## FET-ORDER-003 — histórico comercial preservado (08/10/2026)

F011 / FET-P0-009 corrigido. DELETE administrativo de qualquer pedido retorna 405 com Allow: PATCH; não há exclusão física no fluxo comercial. PATCH /api/v1/admin/order/:id/archive e /unarchive são exclusivos para admin, com CSRF e metadata atômica. O painel filtra Ativos (padrão), Arquivados e Todos. Cliente mantém histórico completo, sem metadata administrativa. Arquivamento preserva centavos, snapshot, pagamento, estoque, ledger e replay. Pedidos legados não exigem migração. Auditoria somente leitura: npm.cmd run audit:orders --prefix ecommerce.

Detalhes: [Histórico de pedidos](HISTORICO_PEDIDOS.md) e [Relatório FET-ORDER-003](RELATORIO_FET_ORDER_003.md). F002 é a próxima recomendação, sem início automático.


## F002 / FET-P0-002 — Envio antes da confirmação do pagamento

Status: CORRIGIDO pela FET-ORDER-004 (08/10/2026). Novos Orders nascem paymentStatus=PENDING dentro da transação. Processing→Shipped e Shipped→Delivered exigem PAID e paidAt BSON Date válido; saltos e retrocessos retornam409. Mesmo estado é idempotente, target inválido400. Atualização condicional atômica/CAS preserva Stock, ledger, idempotência e archive. Cliente/admin não conseguem forçar PAID por payload; legado sem estado confiável é UNVERIFIED sem migração. UI separa pagamento do status comercial e bloqueia envio sem confirmação.

Até F001 nenhum endpoint confirma pagamento: novos pedidos permanecem bloqueados para expedição. Reservas Pending continuam consumindo Stock; cancel/release/refund permanecem F028. Históricos já enviados sem confirmação exigem auditoria/revisão, sem reparo automático. audit:orders foi estendido em modo somente leitura.

Documentação: [Estados do pedido e pagamento](ESTADOS_PEDIDO_PAGAMENTO.md) e [Relatório FET-ORDER-004](RELATORIO_FET_ORDER_004.md). Próxima recomendação: F001; não iniciada automaticamente.
