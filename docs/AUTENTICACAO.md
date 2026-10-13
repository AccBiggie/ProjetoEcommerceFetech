# Autenticação e revogação JWT

## Lifecycle atual — FET-DATA-003 / F016

Somente contas ACTIVE (incluindo legados sem status) autenticam. Desativação revoga sessões e reset tokens, bloqueia login com erro genérico e mantém forgot uniforme sem email/token. Reativação exige novo login com a senha atual; JWT antigo permanece inválido. Metadata administrativa não aparece no serializer público. [Contrato completo](LIFECYCLE_USUARIOS.md).

FET-OPS-002: logs e eventos de audit não contêm credenciais, JWT/cookies, e-mails, IP bruto ou token de reset. Auth acrescenta somente userId/role ao contexto de observabilidade; autorização permanece baseada em req.user/banco. [Contrato de observabilidade](OBSERVABILIDADE.md).

Atualização FET-SEC-001 a FET-SEC-007 em 08/10/2026. A autenticação continua usando JWT
assinado no cookie `token` HttpOnly; o frontend não armazena o JWT em Redux,
localStorage ou sessionStorage. A resposta JSON não contém JWT: o navegador
transporta a sessão somente pelo cookie HttpOnly.

## Versão de autenticação

`User.tokenVersion` é um Number persistido, inteiro não negativo, com default
zero. O payload de todo JWT novo inclui `id`, `tokenVersion`, `iat` e `exp`.
Cadastro, perfil e atualização administrativa possuem allowlists e ignoram
`tokenVersion` enviado pelo cliente. Login não incrementa a versão.

O middleware valida assinatura e expiração, rejeita claims de versão ausentes
ou inválidos, consulta o usuário no MongoDB e compara as versões estritamente.
Sessões revogadas, expiradas, inválidas e de contas removidas retornam 401 com
`success: false` e mensagem genérica. A role persistida determina a autorização:
rebaixar um admin mantém a autenticação, mas retira imediatamente seu acesso
administrativo (403).

## Eventos de revogação

| Evento | Persistência e sessão resultante |
| --- | --- |
| `POST /api/v1/logout` | Exige CSRF; incremento condicionado ao ID e à versão JWT, limpa cookie; 200 idempotente para sessão ausente/inválida/revogada. GET retorna 405/Allow: POST sem mutar. |
| `PUT /api/v1/password/update` | Valida senha atual/nova, salva senha e versão incrementada no mesmo documento e emite JWT atualizado. |
| `PUT /api/v1/password/reset/:token` | Valida recuperação, salva senha/versão, remove hash e expiração e emite JWT atualizado. |

Logout **revoga todas as sessões da versão corrente do usuário**, inclusive
outros navegadores. Um JWT revogado não pode incrementar a versão novamente
nem derrubar uma sessão criada posteriormente. Duas chamadas simultâneas com
o mesmo JWT incrementam uma única vez. Sessões individuais por dispositivo
não foram implementadas.

Documentos antigos sem `tokenVersion` são hidratados com zero pelo Mongoose.
A condição de atualização aceita zero ou campo ausente apenas no documento
persistido; **não existe fallback de versão para JWT recebido**. `$inc` persiste
o campo no logout. Save após troca/reset persiste a versão normalmente. Não
há migration ou backfill obrigatório.

Alterações de senha usam `document.$where` para condicionar o save à versão
lida, preservando o hook bcrypt existente. Se outra revogação vencer primeiro,
o save desatualizado retorna 401 e não altera a senha/versão. No reset, o save
também exige o hash original e a expiração ainda válida. Hash SHA-256, token
aleatório, single-use e limpeza após falha de SMTP permanecem protegidos.
Referência técnica: [Mongoose Model.prototype.$where](https://mongoosejs.com/docs/api/model.html#Model.prototype.$where).

## Deploy e compatibilidade

**Todos os JWTs emitidos antes da introdução de `tokenVersion` serão rejeitados.**
Usuários anteriormente autenticados precisarão fazer login novamente uma vez
após o deploy. Reinicie os processos da API para carregar a implementação;
em ambiente com várias instâncias, atualize todas, sem manter servidores antigos
aceitando JWTs sem versão. Não implante uma versão antiga após a mudança sem
considerar que ela deixaria de verificar a revogação.

Não é necessário alterar o frontend ou corrigir usuários manualmente no MongoDB.
A versão é limitada a inteiros seguros de JavaScript. O limite terminal
`Number.MAX_SAFE_INTEGER` não autentica nem emite JWT; atingir esse limite
exigiria aproximadamente nove quadrilhões de revogações por conta. Ao alcançá-lo,
o sistema falha fechado, sem incremento inseguro, e exige tratamento operacional.

## Testes permanentes

Com MongoDB local ativo, na raiz do projeto:

```powershell
node --test ecommerce/tests/auth.test.js
node --test ecommerce/tests/rateLimit.test.js
node --test ecommerce/tests/passwordRecoverySecurity.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
```

A suíte focada usa `fetech_routes_auth_<pid>_<timestamp>`; API anterior usa
`fetech_routes_*`; navegador usa `fetech_e2e_*`. As bases são temporárias e
removidas no teardown. SMTP é mockado e a chave JWT é efêmera no processo de
teste, sem ler `config.env`. Nenhum teste utiliza o banco real `fetech`.

Os 28 testes focados cobrem claims, replays, concorrência, usuários legados,
mass assignment, autorização atual, exclusão, recuperação e validações rejeitadas.
O mapeamento individual e os resultados estão em [PLANO_MELHORIAS_FETECH.md](PLANO_MELHORIAS_FETECH.md).

## Rate limiting distribuído — F008

Os endpoints públicos `/login`, `/password/forgot`, `/password/reset/:token`
e `/register`, sob `/api/v1`, usam a coleção MongoDB `authratelimits`.
Não há Redis, contadores em memória ou bloqueio permanente no User.

| Scope | Limite | Janela |
| --- | --- | --- |
| `login:account-ip` | 5 falhas | 15 min |
| `login:account` | 20 falhas | 15 min |
| `login:ip` | 50 falhas | 15 min |
| `forgot:account` | 5 requisições | 15 min |
| `forgot:ip` | 10 requisições | 15 min |
| `reset:ip` | 10 requisições | 15 min |
| `register:ip` | 10 tentativas | 60 min |

As políticas ficam centralizadas em `backend/config/authRateLimits.js`.
Não foi adicionada configuração obrigatória. A factory do serviço permite
injetar políticas, store e relógio nos testes; não há endpoint de bypass.

O IP vem de `req.ip`. A política padrão do Express mantém `trust proxy=false`:
`X-Forwarded-For` recebido de origem não confiada não altera a chave. Atrás do
Vite/proxy atual, requisições compartilham o IP do proxy. Em produção, definir
uma lista/topologia de proxies confiáveis antes de identificar clientes reais;
não habilitar `trust proxy=true` indiscriminadamente.
Referência: [Express atrás de proxies](https://expressjs.com/en/guide/behind-proxies/).

Chaves são HMAC-SHA256 com separação de domínio, scope e identidade. Usa-se a
`JWT_SECRET` já existente, exclusivamente no backend, sem nova variável obrigatória.
E-mail segue a conversão já usada pelos controllers, seguida de trim/lowercase;
formatos alternativos que o controller converte para o mesmo e-mail não criam
novas quotas. O limiter não consulta a existência da conta para derivar a chave.
E-mail, IP puro, senha, JWT e token de recuperação não são armazenados na coleção.
Todas as instâncias devem usar a mesma chave e políticas; rotacionar a chave
muda as chaves do limiter e invalida os JWTs existentes.

### Concorrência e janelas

Cada chave possui janela fixa iniciada pela primeira tentativa. O MongoDB
reseta logicamente uma janela vencida e adquire capacidade numa única operação
`findOneAndUpdate` com pipeline, consultando `_id` indexado. Não é necessário
replica set/transação para as operações atômicas individuais desta implementação.
Referência: [findOneAndUpdate com pipeline](https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/).

Login reserva capacidade em `pending` antes da consulta de senha/bcrypt.
`count + pending` deve ficar abaixo do limite para admitir outra tentativa.
Falha converte a reserva em `count`; sucesso libera a reserva e zera falhas
de conta/conta+IP, preservando o histórico global de IP e reservas concorrentes.
Erros de login, incluindo formulário incompleto, contam como tentativas falhas.
Quotas atingidas impedem inclusive um login correto até a expiração aplicável.

Se um scope posterior negar a tentativa, as reservas anteriores são liberadas.
Liberação/finalização ocorre uma única vez; todas as operações iniciadas são
aguardadas mesmo se uma falhar. Conclusões antigas são condicionadas à janela
original e não alteram janelas novas. Uma queda do processo/storage pode deixar
reservas pendentes até o fim da janela, sem bloqueio permanente. As instâncias
devem manter relógios sincronizados; o relógio de teste é injetável, sem sleeps longos.

Forgot/reset/register consomem capacidade antes do controller, independentemente
do resultado. Em forgot, uma solicitação negada pelo scope da conta ainda pode
consumir a quota de IP previamente admitida. Após bloqueio, não há geração de
token, chamada SMTP, bcrypt de cadastro ou criação de conta adicional.
Logout, alteração autenticada de senha e rotas administrativas não recebem
este limiter. As garantias de tokenVersion, hash, validade e single-use permanecem.

### Respostas, storage e cleanup

Bloqueio retorna HTTP **429**, header `Retry-After` em segundos, arredondado para
cima, e mensagem genérica: “Muitas tentativas. Tente novamente mais tarde.”
Não informa qual scope bloqueou nem a existência da conta. O frontend já
apresenta a mensagem da API pelo tratamento centralizado de erros; não houve
alteração de UI ou criação de E2E artificial.

Falha do MongoDB/limiter retorna **503**, sem autenticar, emitir sessão ou liberar
acesso por fallback local. Writes parciais podem conservar reservas até expirar.
O store Mongo está separado do serviço para permitir substituição futura.

Model `AuthRateLimit`: `_id` derivado, `scope`, `count`, `pending`,
`windowStartedAt`, `expiresAt`. Índices: `_id_` único e `expiresAt_1` TTL com
`expireAfterSeconds: 0`. A API prepara o índice antes de abrir a porta.
O TTL limpa dados eventualmente; a autorização compara timestamps e desbloqueia
sem aguardar exclusão física. Referência: [TTL do MongoDB](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Riscos residuais

F009 foi corrigido quanto a status, corpo e headers públicos. Latência SMTP
externa ainda pode introduzir variação temporal além do piso configurado.
MFA, implantação de HTTPS e CAPTCHA
dependem de tarefas próprias. Proxy definitivo, capacidade/disponibilidade do
MongoDB, alertas e observabilidade completa também exigem validação operacional.
Logout usa POST protegido; GET retorna 405. Estas remediações não alteram pedidos, estoque
ou pagamento. O relatório histórico da auditoria não foi editado.

## Recuperação sem enumeração — F009 / FET-P1-001

`POST /api/v1/password/forgot` responde HTTP 200 com o mesmo JSON para conta
existente, inexistente, SMTP ausente e falha SMTP:

```json
{
  "success": true,
  "message": "Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha."
}
```

Não confirma conta ou entrega; não expõe PII, token, ID ou expiração. A UI já
apresenta a mensagem da API; 429 e falhas globais continuam no fluxo de erro.
Trim/lowercase e coerção existente são preservados. Não há envio nem criação
de User/token para inexistente. F008 consome quotas antes do lookup; a sexta
tentativa da mesma conta em 15 minutos continua 429 com `Retry-After`.

Sucesso de SMTP preserva hash SHA-256/expiração de 15 minutos. Falha registra
apenas `password_recovery_email_failed`, sem erro bruto ou credenciais, e remove
hash/expiração persistidos. A remoção exige ID + hash original, preservando um
token mais recente. Erros de consulta/save/cleanup seguem o middleware global;
falha do limiter permanece 503. Não se converte indisponibilidade estrutural
em sucesso. Reset single-use e revogação JWT de F006 continuam protegidos.

Configuração opcional: `AUTH_FORGOT_MIN_RESPONSE_MS`, default 300 ms. Valores
finitos entre 0 e 5000 são aceitos; inválidos usam 300. Zero desativa o piso e
não é recomendado para produção. Não exige mudança no config.env existente.
O relógio monotônico mede o tempo no controller; timer assíncrono espera apenas
o restante, sem busy-wait. O piso não se aplica ao 429 já emitido pelo gate.
Testes configuram 20 ms; helper aceita relógio/sleep injetados para verificação
determinística. O probe com 300 ms mostrou medianas locais próximas de 326 ms.

SMTP externo lento pode ultrapassar o piso: não há garantia de resistência
absoluta a timing attacks. F040 tratará processamento assíncrono/outbox.
Forgots concorrentes ainda podem substituir tokens (último save prevalece),
inclusive tornando um link enviado anteriormente inválido. Não foi redesenhado
esse fluxo; limpeza condicionada evita apagar uma recuperação mais recente.
Observabilidade completa e MFA continuam pendentes; hardening HTTP/CSRF está
implementado no código pela FET-SEC-007.

## Administração — FET-SEC-004

Role autorizada é sempre a persistida no User. Mutação administrativa recarrega
o executor sob lock compartilhado e rejeita quem perdeu permissão enquanto
aguardava. Rebaixamento mantém JWT como sessão comum (rotas admin 403); desativação
faz JWT antigo retornar 401. DELETE físico retorna 405 sem alterar a conta.
Body continua incapaz de alterar tokenVersion ou campos de lifecycle.
Geração interna do lock é ocultada nas respostas e não participa do JWT.

Autodesativação/autorrebaixamento retornam 403; último administrador ativo e concorrência
são protegidos no backend. Primeiro admin pode ser criado por CLI interativo
somente quando zero admins ACTIVE, com confirmação da database e senha oculta. Bootstrap
não emite JWT/cookie; o login normal permanece protegido por F008. Recuperação
de admin mantém exatamente o contrato genérico F009. Política e operação estão
em [ADMINISTRACAO.md](ADMINISTRACAO.md).

## Cookie e reverse proxy — FET-SEC-005 / F007

`backend/config/authCookie.js` é a única política para emissão e limpeza do
cookie `token`. Cadastro, login, troca e reset de senha passam pelo `sendToken`;
logout usa `clearAuthCookie`. Todos usam HttpOnly, SameSite=Lax, Path=/ e não
definem Domain: cookie host-only. Nome, resposta JSON e revogação F006 permanecem.

| NODE_ENV | Secure | Transporte previsto |
| --- | --- | --- |
| development | false | HTTP local |
| test | false | HTTP isolado |
| production | true | HTTPS real obrigatório |
| ausente/outro | false | Não identifica produção; configurar production exatamente |

Secure depende exclusivamente de `NODE_ENV === 'production'`, avaliado na
emissão/limpeza. `COOKIE_SECURE=false`, `req.secure` e X-Forwarded-Proto não
desativam essa proteção. Cookie Secure não implanta TLS: os probes de produção
simulam o ambiente e inspecionam headers por HTTP, sem afirmar deployment HTTPS.

`COOKIE_EXPIRE` continua em dias (exemplo existente: 7). Deve resultar em número
finito positivo e data futura válida; frações positivas são aceitas. Ausência,
zero, negativos, NaN, infinito ou data inválida impedem startup, antes de abrir
porta/conectar banco. A emissão também valida. Não é validação completa de env.
Logout usa `res.clearCookie`, com os mesmos atributos base e sem passar
expires/maxAge; Express 5 define expiração passada. Revogação server-side
continua necessária mesmo após remoção no navegador.

`backend/config/trustProxy.js` aceita `TRUST_PROXY_HOPS` ausente ou string `0`
como false; strings `1` a `5` configuram número de hops no Express. Demais valores
impedem startup (inclusive vazio, true, *, all, -1, abc, 999, frações ou espaços).
O exemplo usa 0; o config.env real não foi alterado. Nunca usar trust proxy=true.

O rate limiter continua usando req.ip: com default false, spoof de
X-Forwarded-For não muda a identidade. Com hops=1, o endereço confiável é
resolvido a partir do socket e da cadeia da direita para a esquerda: no teste
`203.0.113.5, 198.51.100.7`, req.ip é `198.51.100.7`. Só habilitar hops após
validar infraestrutura: proxy deve sanear/substituir X-Forwarded-For e
X-Forwarded-Proto, bloquear acesso direto ao backend e evitar caminhos com
menos proxies que a contagem configurada. Isso prepara configuração; nenhum
proxy/TLS real foi implantado. Referência: [Express atrás de proxies](https://expressjs.com/en/5x/guide/behind-proxies/).

Testes dedicados: `node --test tests/authCookieSecurity.test.js` dentro de
ecommerce (33 casos). Incluem emissores, expiração, startup inválido, logout,
replay, default anti-spoof, hops e regressões F006/F008/F009/F010. E2E confere
HttpOnly/SameSite/Path e remoção efetiva no navegador em HTTP de teste.
Reiniciar todas as instâncias da API para carregar a política nova.

F021 foi corrigido pela FET-SEC-006 e F020 no código pela FET-SEC-007.
F023 (deployment/TLS), F036 (env completo), HSTS real e MFA permanecem pendentes.
Config.env, banco real e auditoria histórica foram preservados.

## Respostas privadas — FET-SEC-006 / F021

Os quatro emissores (register/login/updatePassword/resetPassword) retornam
somente `{ "success": true, "user": { ... } }`, com HTTP 201 no cadastro e
200 nos demais. JWT não aparece em campo substituto nem header acessível ao JS;
é enviado apenas no Set-Cookie token HttpOnly, com a política F007 preservada.
Nenhum JWT real deve aparecer em logs, traces, artifacts ou documentação;
o mesmo cuidado vale para cookies, senhas e tokens de recuperação (F025).

`backend/utils/privateResponse.js` centraliza Cache-Control: no-store:
isAuthenticatedUser chama antes de verificar sessão, sendToken antes da emissão
e logout antes da revogação. Assim 401 de autenticação, 403 de role e erros
posteriores ao middleware privado mantêm o header. Mutações herdam a política.
Validações anteriores ao auth (por exemplo router.param) não passam por esse
middleware; não foi criada uma política global de cache de erros.

Inventário das 30 combinações método/rota protegidas (prefixo `/api/v1`):

| Método | Rotas |
| --- | --- |
| GET | /me |
| PUT | /me/update, /password/update |
| GET | /addresses, /address/:id |
| POST | /address/new |
| PUT | /address/:id, /address/:id/favorite |
| DELETE | /address/:id |
| GET | /orders/me, /order/:id |
| POST | /order/new |
| GET | /admin/users, /admin/user/:id, /admin/orders, /admin/products |
| PUT, DELETE | /admin/user/:id, /admin/order/:id (DELETE: 405) |
| PATCH | /admin/user/:id/deactivate, /admin/user/:id/reactivate |
| POST | /product/new |
| PUT, DELETE | /product/:id |
| PUT | /review |
| DELETE | /reviews |
| GET | /admin/categories, /admin/category/:id |
| POST | /admin/category |
| PUT, DELETE | /admin/category/:id |

Rotas públicas products/product/categories/category/reviews não recebem
no-store por essa regra, mesmo com cookie incidental. Nenhuma regra global
baseada na presença de cookie; ETag global permanece. Forgot genérico e falhas
de login/reset anteriores à emissão não tiveram política adicional de cache.
Somente o sucesso dos emissores públicos passa pelo sendToken.

Frontend oficial usa chamadas Axios relativas e Redux com user/success; não
depende de data.token, não usa Bearer nem persiste JWT. Não exigiu mudança em
produção frontend. E2E verifica ausência de campos de sessão nas respostas,
no-store, ausência de Bearer, JWT no localStorage/sessionStorage e inacessibilidade
do cookie ao document.cookie. Os mesmos testes cobrem login/cadastro/troca/reset.

Harness já obtinha sessão do Set-Cookie; agora extractCookieValue é reutilizável
e seleciona o cookie pelo nome. Replay não lê body.token nem imprime o segredo.
`node --test ecommerce/tests/privateResponseSecurity.test.js`: 35 regressões.

Compatibilidade: body.token deixou o contrato; clientes externos dependentes
precisam migrar para cookie. JWT/cookie/tokenVersion e sessões existentes não
mudam apenas por esta task; não exige logout global. Reiniciar todas as APIs
para carregar a política; nenhuma instância real foi reiniciada nesta execução.

F020 foi posteriormente implementado no código pela FET-SEC-007. F023
(TLS/proxy/CDN real), F025 (observabilidade/redaction) e F036 (env completo) permanecem abertos.
Cache/headers precisam ser validados no proxy/CDN de staging quando implantados.
Próxima task recomendada após FET-SEC-007: F036; não iniciada automaticamente.

## Hardening HTTP e CSRF — FET-SEC-007

Helmet/CSP protegem API; CSP própria protege documento/estático do host E2E.
HSTS/hosting real dependem da F023. POST/PUT/PATCH/DELETE sob /api/v1 exigem
X-Fetech-CSRF: 1 antes de parsers/limiter/controllers. Header público fixo,
sem JWT/segredo. Origin exata, fallback Referer e Fetch Metadata reforçam o gate;
origens hostis/null/malformadas e metadata cross-site/same-site são rejeitados.
Sem Origin/Referer, clientes não-browser com header correto continuam suportados.

Logout POST protegido preserva F006/F007/F021. GET/HEAD retornam 405 sem
revogar/limpar cookie; POST inválido retorna 403 e mantém sessão. Frontend
envia header pelo interceptor Axios e migrou logout para POST. Body.token
continua ausente, no-store privado/cookie Secure/HttpOnly/Lax intactos.
FRONTEND_URL deve ser HTTPS explícito válido em produção; erro falha startup.
Políticas, configuração, compatibilidade e CSP exatas: [SEGURANCA_HTTP.md](SEGURANCA_HTTP.md).

## Configuração central — FET-SEC-008

JWT_SECRET/JWT_EXPIRE e COOKIE_EXPIRE são validados antes de conexão/listen, pelo [contrato de ambiente](CONFIGURACAO.md). Production exige secret de no mínimo 32 bytes, sem placeholders; não existe secret default. Cookie, revogação, rate limiting e resposta uniforme não mudaram. PASSWORD e demais credenciais não aparecem em erros de configuração. Valores de configuração são snapshots tipados; alterações exigem reinício.
# Atualização FET-MEDIA-001

Conta DEACTIVATED não pode fazer upload de avatar. [Contrato de mídia](AVATAR_E_MIDIA.md).

## F040 — exceção de recuperação de senha

Cadastro grava ACCOUNT_REGISTERED junto com User. Forgot/reset mantém envio
direto controlado pelo adapter e F009 (resposta uniforme, timing floor, hash,
expiração, cleanup quando envio falha). Token/link de reset nunca entra no
outbox. Cookie/JWT e rate limiting permanecem. [Contrato](EMAILS_TRANSACIONAIS.md).
