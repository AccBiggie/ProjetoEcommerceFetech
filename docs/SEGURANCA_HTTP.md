# Segurança HTTP — FET-SEC-007 / F020

Atualizado em 08/10/2026. **CORRIGIDO NO CÓDIGO.** API protegida com Helmet
8.3.0; build validado no host estático E2E. Esse host é exclusivamente de teste
e não deve ser publicado. F023 deve reproduzir os headers no hosting real e
validar CSP/proxy/TLS/HSTS em staging HTTPS; nada disso foi implantado nesta task.

## Pipeline e headers

`backend/config/securityHeaders.js` exporta factories para API e frontend.
Helmet entra antes dos parsers e dos routers. Proteção CSRF do prefixo /api/v1
roda antes de JSON/urlencoded, uploads, rate limiter, autenticação e controllers;
não consulta banco. Rejeições não consomem bcrypt/quota legítima.

| Header | API e host estático E2E |
| --- | --- |
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| Referrer-Policy | strict-origin-when-cross-origin |
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Resource-Policy | same-origin |
| Origin-Agent-Cluster | ?1 |
| X-DNS-Prefetch-Control | off |
| X-Download-Options | noopen |
| X-Permitted-Cross-Domain-Policies | none |
| X-XSS-Protection | 0 |

X-Powered-By removido. COEP não habilitado; não há necessidade de isolamento
cross-origin completo. Permissions-Policy não adicionado. **HSTS desabilitado
nesta fase**, incluindo simulação de production; depende do domínio HTTPS real
em F023. Não há upgrade-insecure-requests implícito. Configuração consciente
dos defaults conforme [referência oficial do Helmet](https://helmet.js.org/).

API JSON recebe CSP restritiva:

```text
default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

O documento HTML precisa de política própria: Helmet na API não protege o host
do frontend. Factory frontendSecurityHeaders aplicada somente à parte estática
do servidor E2E, após o dispatch da API:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
form-action 'self'; script-src 'self'; script-src-attr 'none';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
font-src 'self' data:; connect-src 'self'; manifest-src 'self'
```

Sem unsafe-eval ou unsafe-inline em script. Estilos inline necessários aos
estilos runtime/atributos do Material UI/Emotion atual; E2E confirma tags Emotion
e UI funcional. Nonces para estilos são evolução futura. Probe adicional do
mesmo build em host estático isolado, sem banco,
retirou unsafe-inline de style-src: observou bloqueio style-src-elem e três
tags Emotion. Isso confirma a necessidade atual da exceção de estilos.
Imagens HTTPS são
permitidas; teste usa fixture HTTPS interceptada, sem serviço externo nem mudança
no produto persistido. Requests /api/v1 same-origin funcionam com connect-src
self. Vite HMR não recebe essa CSP de build; não relaxar a política produtiva
para acomodar desenvolvimento. Reavaliar CSP ao adicionar provedores.

## Proteção CSRF

POST, PUT, PATCH e DELETE sob /api/v1 exigem:

```http
X-Fetech-CSRF: 1
```

Valor público fixo, sem segredo, JWT ou armazenamento CSRF server-side. Aplica-se
a todos os endpoints mutáveis, inclusive login/register/forgot/reset, uploads,
reviews, endereços, pedidos e administração. GET/HEAD/OPTIONS não exigem header.
Corpo/querystring não substituem o header. Não há bypass para NODE_ENV=test.

Origin presente tem precedência e deve ser URL HTTP(S) normalizável, sem
credenciais/path/query/hash, com origin exatamente permitida (protocolo/host/
porta). Null, vazio, malformada, portas/protocolos diferentes e ataques de
prefixo/sufixo são rejeitados. Sem Origin, Referer presente é parseado e sua
origin comparada; path/query do Referer são aceitos. Sem ambos, clientes
não-browser podem prosseguir com header correto e controles normais da rota.
Isso não substitui autenticação/autorização.

Sec-Fetch-Site presente aceita apenas same-origin ou none. Cross-site,
same-site e valores desconhecidos são rejeitados: não existe necessidade atual
de exceção para same-site. Metadata ausente não bloqueia clientes não-browser.

Rejeições retornam 403/no-store com resposta genérica, sem detalhar a causa:

```json
{ "success": false, "message": "Requisição não autorizada." }
```

Nenhum cookie emitido ou mutação executada. Rota API desconhecida com método
inseguro sem proteção retorna 403 antes do 404; com proteção válida retorna 404.
Assets não entram no gate. CORS permissivo não foi adicionado; OPTIONS pode
informar métodos pelo Express, mas não libera origens/credenciais cross-origin.

## Configuração de origins

Usa somente FRONTEND_URL, nunca Host/X-Forwarded-Host/req.secure para construir
allowlist. Configuração calculada no startup; reiniciar APIs após alteração.

| Ambiente | Origins |
| --- | --- |
| development/test/outro não produtivo | http://localhost:3000, http://127.0.0.1:3000 e origin explícita configurada |
| production | Somente origin da FRONTEND_URL explícita e HTTPS |

FRONTEND_URL, quando configurada, deve ser URL absoluta HTTP(S), sem credenciais,
wildcard, espaços ou barras invertidas. Em produção ausência/inválida/HTTP
impede startup antes de conexão ao banco. Caminho de base é permitido na
configuração; a allowlist usa somente origin. Validação pontual, não schema
completo de environment (F036). Exemplo permanece localhost:3000; config.env
real não foi sobrescrito. Testes usam explicitamente 127.0.0.1:3300.

Proxy Vite muda Host para o backend, mas preserva Origin do navegador; chamadas
relativas continuam same-origin. Trust proxy continua false por padrão (F007).
TLS/proxy/origin reais precisam ser validados em staging.

## Frontend e clientes HTTP

`frontend/src/utils/httpClient.js` registra interceptor no Axios padrão antes
de renderizar a SPA. Todos os consumidores atuais usam esse cliente: Redux user/
product/cart actions, dashboard, categorias, reviews, endereços, checkout e
pedidos. Somente mutações same-origin sob /api/v1 recebem o header; GETs e URLs
externas não recebem o header por esse interceptor. Sem Bearer/JWT/segredo.

Harnesses usam withCsrf; fixtures Playwright que preparam dados por HTTP usam
helper mutation. Requests reais da UI recebem header pelo interceptor, sem
interceptação Playwright para adicioná-lo. E2E verifica os headers das mutações
observadas e falha em violações CSP relevantes, registrando só directives/
booleanos, sem blockedURI que possa conter token de recuperação.

Clientes externos devem enviar X-Fetech-CSRF: 1 em chamadas mutáveis. Sem
Origin/Referer continuam suportados; headers explicitamente hostis são rejeitados.
Se CORS cross-origin for necessário no futuro, revisar esta política antes de
liberá-lo. Webhooks futuros deverão ter assinatura própria e exceção explícita
ao gate; nenhum webhook/exceção existe hoje.

## Logout

Novo contrato: POST /api/v1/logout com header anti-CSRF e origem válida quando
presente. Mantém 200, success/message, no-store, revogação condicionada da
versão JWT e limpeza consistente do cookie (F006/F007/F021).

GET /api/v1/logout retorna 405 e Allow: POST, sem consultar banco, revogar JWT
ou limpar cookie. HEAD também não muta. POST sem proteção/cross-site retorna
403, mantendo sessão; POST válido revoga e replay retorna 401. Sem cookie,
POST protegido permanece idempotente. Logout antigo não derruba sessão nova.
Frontend atualizado para POST; clientes externos precisam migrar. Não há
logout global ou incremento de tokenVersion causado apenas por este deploy.

## Verificação e continuidade

```powershell
node --test ecommerce/tests/httpSecurity.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
npm.cmd audit --prefix ecommerce --cache .local/npm-cache
```

Resultados e probes no [plano de melhorias](PLANO_MELHORIAS_FETECH.md).
F006/F007/F008/F009/F010/F021 permanecem corrigidos. JWT/cookie/senha/reset
token nunca devem entrar em logs/traces; observabilidade/redaction completa
permanece F025. Banco real, config.env e auditoria histórica preservados;
testes somente em bancos temporários com teardown. Reiniciar todas as APIs
para carregar o novo contrato; nenhuma instância real reiniciada nesta task.
No encerramento FET-SEC-007, a recomendação era F036; implementada posteriormente na FET-SEC-008 (ver seção abaixo).

## Configuração central — FET-SEC-008

FRONTEND_URL e TRUST_PROXY_HOPS agora chegam aos consumidores pelo snapshot validado de runtimeConfig.js. A configuração preserva o validador puro F020 e normaliza URLs com path para origin, inclusive nos links de reset. Origin produtiva HTTPS e hops 0..5 são validados antes de importar o app/conectar Mongo/listen. Consulte [CONFIGURACAO.md](CONFIGURACAO.md). CSP, HSTS desabilitado, CSRF, Fetch Metadata e logout POST permanecem iguais.
