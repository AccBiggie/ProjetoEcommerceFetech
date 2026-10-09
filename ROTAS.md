# Revisao das rotas e dos fluxos

## Lifecycle de User — FET-DATA-003

DELETE físico de User é 405 (Allow: PATCH). Admin usa PATCH `/api/v1/admin/user/:id/deactivate` ou `/reactivate`, com no-store/Request ID/CSRF e auditoria atômica. GET `/api/v1/admin/users?status=active|deactivated|all` filtra contas; padrão active. Campos administrativos aparecem apenas no DTO admin. [Contrato completo](docs/LIFECYCLE_USUARIOS.md).

## Observabilidade — FET-OPS-002

Todas as respostas da API recebem `X-Request-Id` UUID v4 do servidor. Header de entrada não escolhe o ID.

| Método | Rota | Acesso | Contrato |
| --- | --- | --- | --- |
| GET | `/api/v1/health/live` | Público | 200, processo respondendo, sem consulta Mongo; no-store |
| GET | `/api/v1/health/ready` | Público | 200 com Mongo atual/transações disponíveis; 503 em falha, sem reconectar; no-store |
| GET | `/api/v1/admin/audit-events` | Admin autenticado | Page 1/limit 25, máximo 100; filtros explícitos; no-store |

Auditoria tem consulta apenas; sem endpoints create/update/delete. Dashboard oferece aba Auditoria. Rotas administrativas existentes geram eventos persistentes atômicos conforme [inventário completo](docs/OBSERVABILIDADE.md). F024 continua parcial; pagamento/frete não implementados.

## Navegacao da loja

| Rota | Comportamento |
| --- | --- |
| `/` | Catalogo inicial e adicao ao carrinho |
| `/products` | Catalogo com categoria, busca e paginacao |
| `/products?category=...&keyword=...&page=...` | Filtros preservados na URL, inclusive apos recarga |
| `/products/:keyword` | Busca pela URL antiga, mantida por compatibilidade |
| `/product/:id` | Detalhe, carrinho e avaliacoes; erro legivel para ID invalido ou produto removido |
| `/search` | Pagina de pesquisa |
| `/cart` | Quantidades, remocao, persistencia e acesso ao checkout |
| `/login` | Login/cadastro; retorna ao destino que exigiu autenticacao |
| `/password/forgot` | Solicita e-mail de recuperacao |
| `/password/reset/:token` | Redefine senha utilizando o token da URL |
| `/account` | Perfil autenticado |
| `/addresses` | CRUD dos próprios endereços e favorito único; acesso no perfil e menu da conta |
| `/me/update` | Atualiza nome, e-mail e avatar opcional |
| `/password/update` | Altera senha autenticada |
| `/shipping` | Cards de endereços cadastrados, campos editáveis e criação de pedido autenticado |
| `/orders` | Pedidos do cliente autenticado |
| `/order/:id` | Detalhe do pedido; disponivel para o proprietario e o administrador |
| `/dashboard` | Administracao de produtos, usuarios e pedidos; exclusivo para `admin` |
| `/sad` | Redireciona para o inicio; evita a antiga tela de carregamento permanente |
| demais URLs | Pagina nao encontrada, com acesso ao catalogo |

As categorias são registros do MongoDB, consultados pela API e compartilhados
entre menu, home, filtro e dashboard. Subcategorias usam `parent_id` como
referência da categoria pai; produtos usam `category_id`. O filtro de uma
categoria inclui seus descendentes. `categories.json` permanece apenas para
dados de demonstração e fixtures. Veja [docs/CATEGORIAS.md](docs/CATEGORIAS.md).

## API

Todas as rotas abaixo usam o prefixo `/api/v1`.

Endereços usam o model `Address`, coleção própria vinculada ao usuário.
Rotas autenticadas: `GET /addresses`, `POST /address/new`,
`GET/PUT/DELETE /address/:id` e `PUT /address/:id/favorite`.
O proprietário vem da sessão; IDs de outra conta retornam 404, inclusive
para admin. CEP e telefone são strings. O índice único parcial protege o
favorito por usuário; excluir o favorito não escolhe outro automaticamente.
O checkout copia um snapshot completo e independente de `Address`, com
`shippingInfoVersion: 2` controlado pelo servidor e CEP/telefone strings.
Consulte [docs/ENDERECOS.md](docs/ENDERECOS.md) e
[docs/VALIDACAO_CHECKOUT.md](docs/VALIDACAO_CHECKOUT.md).

Validação após endereços em 07/10/2026: 13 testes da API, build e 15 fluxos
E2E aprovados, incluindo checkout existente e snapshot histórico de pedidos.

O CRUD de categorias tem rotas próprias: `GET /categories` e
`GET /category/:id` públicos; `GET /admin/categories`,
`POST /admin/category` e `GET/PUT/DELETE /admin/category/:id` para admin.
`GET /categories?parent_id=null` lista categorias principais; usar o ID
em `parent_id` lista filhos diretos. A API rejeita ciclos, pais inexistentes
e nomes duplicados; excluir categorias com filhos ou produtos retorna 409.

| Metodo | Rota | Acesso |
| --- | --- | --- |
| GET | `/products`, `/product/:id`, `/reviews?id=:productId` | Publico |
| POST | `/register`, `/login`, `/password/forgot` | Publico |
| PUT | `/password/reset/:token` | Token de recuperacao valido |
| POST | `/logout` | Exige proteção CSRF; revoga versão JWT e expira cookie; idempotente para sessão inválida |
| GET | `/logout` | 405, Allow: POST, sem alteração de sessão/cookie |
| GET | `/me` | Autenticado |
| PUT | `/me/update`, `/password/update` | Autenticado |
| PUT | `/review` | Autenticado; uma avaliacao por usuario/produto |
| DELETE | `/reviews?productId=:productId&id=:reviewId` | Autor da avaliacao ou administrador |

Reviews (FET-DATA-004): PUT aceita `productId` válido, `rating` Number inteiro
1..5 e `comment` string obrigatória, trim, até 2000 caracteres. Mutação exige
CSRF/cookie, mantém no-store e responde `success` e `product` com
`_id/reviews/ratings/numOfReviews` da operação atômica. IDs inválidos: 400;
ausentes: 404; outro autor: 403; histórico inconsistente:
409/`PRODUCT_REVIEW_DATA_INCONSISTENT`, sem reparo. Uma review por usuário/produto,
autoria da sessão. GET também aceita `productId`. [Contrato](docs/REVIEWS_CONCORRENCIA.md).
| POST | `/order/new` | Autenticado |
| GET | `/orders/me` | Autenticado, somente os proprios pedidos |
| GET | `/order/:id` | Proprietario ou administrador |
| GET | `/admin/products`, `/admin/users`, `/admin/orders`, `/admin/user/:id` | Administrador |
| POST | `/product/new` | Administrador |
| PUT, DELETE | `/product/:id` | Administrador |
| PUT | `/admin/user/:id` | Administrador ativo |
| DELETE | `/admin/user/:id` | Administrador ativo; 405 Allow: PATCH |
| PATCH | `/admin/user/:id/deactivate`, `/admin/user/:id/reactivate` | Administrador ativo; CSRF |
| PUT | `/admin/order/:id` | Administrador; transição comercial |
| DELETE | `/admin/order/:id` | Administrador; sempre 405, Allow: PATCH |
| PATCH | `/admin/order/:id/archive`, `/admin/order/:id/unarchive` | Administrador; arquivamento não destrutivo |

`POST /api/v1/order/new`: `shippingInfo` contém `recipientName`, `address`,
`number`, `complement` opcional, `neighborhood`, `city`, `state`, `country`,
`pinCode` e `phoneNo`, todos strings. Obrigatórios rejeitam espaços vazios;
CEP exige 8 dígitos ASCII, telefone 10–15. `orderItems` é array não vazio de
`{ product: ObjectId em string, quantity: Number inteiro seguro >= 1 }`.
Não aceita coerção de quantity. Input inválido retorna 400 antes de consultas
comerciais; produto válido inexistente retorna 404. Preços/totais/versão do
cliente são ignorados. Sessão, CSRF e `Cache-Control: no-store` permanecem ativos.

Também exige `Idempotency-Key` (16–128 caracteres ASCII: letras, números, `-`,
`_`, `.`, `:`). Mesma key/user/intenção retorna 201 com mesmo Order e header
`Idempotency-Replayed: true`; reutilização com payload diferente retorna 409.
Nova key representa nova intenção. PROCESSING espera até 3 s e depois retorna
409/Retry-After 2, sem repetir criação. Confira [docs/IDEMPOTENCIA_PEDIDOS.md](docs/IDEMPOTENCIA_PEDIDOS.md).

IDs invalidos e formularios invalidos retornam 400; recursos inexistentes
e rotas desconhecidas retornam 404. Sessoes ausentes, invalidas, expiradas
ou de usuarios removidos retornam 401. Acesso sem permissao retorna 403.

JWTs novos incluem `User.tokenVersion`. O middleware compara a versão com o
usuário persistido; versões ausentes/inválidas/divergentes retornam 401.
Logout incrementa a versão condicionalmente e revoga globalmente as sessões
daquela versão. Replay de logout antigo não afeta sessões novas; logouts
simultâneos incrementam apenas uma vez. Troca/reset de senha salvam senha e
nova versão juntos e emitem a sessão atualizada. Login e alteração de role
não incrementam a versão. JWTs anteriores ao deploy sem versão exigem novo
login. Consulte [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

O total do pedido é calculado no servidor em centavos, sem aceitar preços,
totais ou estado de pagamento/inventário enviados pelo navegador. Novos
pedidos reservam disponibilidade na criação: Product.Stock, StockMovement
RESERVE, Order RESERVED e conclusão da idempotência commitam juntos. Estoque
insuficiente retorna 409 `ORDER_INSUFFICIENT_STOCK`; falha operacional retorna
503 `ORDER_TRANSACTION_UNAVAILABLE`. PROCESSING/conflito preservam a key.
O envio desses pedidos não reduz Stock novamente e DELETE físico retorna 409.
Pedidos legados mantêm o envio anterior. A API exige Mongo transacional;
detalhes em [docs/ESTOQUE_TRANSACIONAL.md](docs/ESTOQUE_TRANSACIONAL.md).

## Integracoes externas

Cadastro sem foto usa o avatar padrao e funciona sem Cloudinary. Enviar
uma foto exige as tres credenciais Cloudinary do `config.env`; a ausencia
de configuracao retorna 503 com mensagem explicativa.

Recuperacao por e-mail exige `HOST`, `PORTEMAIL`, `USER` e `PASSWORD`.
`EMAIL_SECURE=true` ativa TLS desde o inicio; quando nao informado, isso
ocorre na porta 465. Falhas no envio invalidam o token recem-gerado e nao
retornam sucesso. Os testes substituem Cloudinary e SMTP apenas em seus
processos isolados; nao validam contas reais nesses servicos.

Nao existe provedor de pagamento integrado. O checkout registra o pedido
com `paymentInfo.status = Pending`, sem marcar pagamento ou realizar
cobranca. A interface comunica esse estado ao cliente.

## Validacao reproduzivel

Com MongoDB ativo em `127.0.0.1:27017`, a partir da raiz:

```powershell
cd ecommerce
npm.cmd ci --no-audit --no-fund
npm.cmd test
cd frontend
npm.cmd ci --no-audit --no-fund
npm.cmd run build
cd ..
npm.cmd run test:e2e
```

Os testes de API usam o runner nativo do Node. Os testes de navegador usam
Playwright e o Edge instalado no Windows; em outro sistema, instale o
Chromium com `npx.cmd playwright install chromium`. Para outro navegador
instalado, configure `E2E_BROWSER` (`chrome` ou `msedge`).

Os testes usam bancos temporarios `fetech_routes_*` e `fetech_e2e_*`, removidos
ao final. O servidor de navegador roda na porta 3300 e usa o frontend
compilado. Nenhum teste modifica o banco `fetech` ou depende da senha do
administrador real. Capturas e traces de falhas ficam em
`ecommerce/test-results`, fora do Git.

Resultado apos atualizar as dependencias: 8 grupos de testes da API e
9 fluxos de navegador passaram, incluindo o carrossel com duas imagens
e o layout responsivo com Material UI.
O build com Vite foi concluido. A loja ativa
em `http://localhost:3000` tambem foi conferida no navegador, com filtro
e menu funcionando, API respondendo 200, rota administrativa exigindo
autenticacao e nenhum erro JavaScript nessa verificacao.

Atualização de 07/10/2026: 10 testes da API e 10 fluxos de navegador aprovados
após implementar categorias. A API local foi reiniciada e a migração vinculou
os 12 produtos existentes às 11 categorias, sem apagar dados.

Validação de FET-SEC-001 em 07/10/2026: 28 testes focados de sessão,
41 testes da API, build e 19 fluxos E2E aprovados. Os comandos anteriores
permanecem válidos; `npm.cmd test` inclui `tests/auth.test.js` automaticamente.
Registro da remediação: [docs/PLANO_MELHORIAS_FETECH.md](docs/PLANO_MELHORIAS_FETECH.md).

## Rate limiting de autenticação — FET-SEC-002

`POST /login`, `POST /password/forgot`, `PUT /password/reset/:token` e
`POST /register` possuem quotas temporárias persistidas em MongoDB.
Ao exceder um limite: **429**, mensagem genérica e header `Retry-After`.
Indisponibilidade do limiter: **503**, sem fallback em memória.
O gate precede consulta de senha/bcrypt, geração de recuperação/SMTP e cadastro.
Login considera IP, conta e conta+IP; sucesso limpa falhas da conta/conta+IP,
preservando o histórico de IP. Logout e rotas admin não recebem essas quotas.
Políticas e índices: [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).
F009 foi corrigido em FET-SEC-003: solicitações permitidas de recuperação
retornam o contrato genérico abaixo, independentemente de existência da conta
ou falha SMTP. Rate limit continua 429; falhas estruturais seguem o middleware.

Validação final: 35 testes focados do limiter, 76 testes da API (incluindo
28 testes JWT), build e 19 E2E aprovados. `node --test ecommerce/tests/rateLimit.test.js`
executa os cenários distribuídos, concorrência, spoof, expiração e falhas de storage.

## Recuperação sem enumeração — FET-SEC-003

`POST /api/v1/password/forgot`, body `{ "email": "cliente@example.test" }`:

```json
{
  "success": true,
  "message": "Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha."
}
```

HTTP 200 não confirma existência ou envio. Conta inexistente não cria User/token
nem chama SMTP. Sucesso mantém hash SHA-256 e validade de 15 minutos; falha SMTP
remove hash/expiração condicionando a limpeza ao token daquela solicitação.
Bloqueio 429 inclui `Retry-After` e impede geração/envio. Indisponibilidade do
limiter continua 503; erros estruturais não são mascarados como sucesso.
Piso assíncrono opcional `AUTH_FORGOT_MIN_RESPONSE_MS=300` aplicado após o gate;
testes usam 20 ms. SMTP lento pode ultrapassar o piso; outbox permanece em F040.
Validação atual: 25 testes focados de recuperação, 101 testes API,
build aprovado e 19 fluxos E2E aprovados.

## Segurança administrativa — FET-SEC-004

`PUT /api/v1/admin/user/:id`: autorrebaixamento retorna 403; manter a própria
role admin ou atualizar campos sem alterar role continua permitido. Promoção
de user e rebaixamento de outro admin funcionam com executor atualmente admin.
`DELETE /api/v1/admin/user/:id`: retorna 405 Allow: PATCH, sem desativar.
`PATCH /api/v1/admin/user/:id/deactivate` e `/reactivate`: transição administrativa auditada; auto-desativação retorna 403.
Reduções que deixariam zero admins ACTIVE retornam 409. Conflito/lease perdido: 409;
indisponibilidade do lock: 503. Formato de erro existente preservado, sem stack.

Executor/alvo/contagem são recarregados dentro do lock MongoDB compartilhado;
gerações condicionam escritas atrasadas. Queda/crash é tratada pelo lease.
Body não altera tokenVersion ou geração interna. Rebaixamento retira acesso
admin imediatamente; desativação invalida autenticação e preserva User/referências.
F016 corrigido no código. Conta reativada exige novo login;
veja o [lifecycle](docs/LIFECYCLE_USUARIOS.md).

Bootstrap é CLI: `npm.cmd run admin:bootstrap --prefix ecommerce`.
Somente zero admins ACTIVE, confirmação explícita da database, senha oculta, sem
e-mail/senha fixos, sem promoção automática e sem emissão de sessão. Não é
rota HTTP. Dashboard preserva controles próprios desabilitados e exibe 403/409.
Contrato, lock e procedimento: [docs/ADMINISTRACAO.md](docs/ADMINISTRACAO.md).

## Cookie de autenticação — FET-SEC-005

Cadastro, login, atualização e reset de senha emitem `token` pela mesma política:
HttpOnly, SameSite=Lax, Path=/, sem Domain e duração COOKIE_EXPIRE em dias.
Secure obrigatório em NODE_ENV=production; falso em development/test.
POST `/api/v1/logout` mantém revogação F006 e limpa cookie com mesmos atributos,
expiração passada e valor vazio. Métodos mantidos; JWT no JSON foi removido
posteriormente pela FET-SEC-006 abaixo.
TRUST_PROXY_HOPS ausente/0 mantém req.ip imune a spoof de X-Forwarded-For;
1..5 exige infraestrutura validada. Configuração inválida impede startup.
Detalhes: [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

## JWT e cache privado — FET-SEC-006

`POST /register` (201), `POST /login` (200), `PUT /password/update` (200) e
`PUT /password/reset/:token` (200) retornam o mesmo formato:

```json
{
  "success": true,
  "user": { "...": "campos públicos do usuário" }
}
```

JWT somente no cookie token HttpOnly, sem campo token/jwt/accessToken/authToken
substituto. Os quatro sucessos incluem Cache-Control: no-store e Set-Cookie.
Logout mantém 200/message e recebe no-store. Todas as rotas que passam por
isAuthenticatedUser recebem no-store desde o início, incluindo erros 401/403 e
erros posteriores. Inventário completo em [AUTENTICACAO.md](docs/AUTENTICACAO.md).
Catálogo público não recebe no-store por essa regra, mesmo com cookie; ETag
preservado. Forgot mantém contrato F009. Frontend oficial funciona por cookie;
clientes externos dependentes de body.token precisam atualizar. Sessões
existentes não são revogadas apenas pela remoção do campo.

## Hardening HTTP e CSRF — FET-SEC-007

POST/PUT/PATCH/DELETE sob `/api/v1` exigem `X-Fetech-CSRF: 1`, inclusive
login/register/forgot/reset e multipart. Origin presente precisa corresponder
exatamente à allowlist; sem Origin usa origin do Referer. Sem ambos, cliente
HTTP com header correto pode prosseguir. Sec-Fetch-Site presente aceita somente
same-origin/none; cross-site/same-site/inválido retorna 403 genérico/no-store,
sem controller, cookie, bcrypt ou consumo do limiter. GET/HEAD/OPTIONS não
exigem CSRF. Rota desconhecida insegura sem proteção: 403 antes de 404.

Logout POST preserva 200/message/no-store/revogação; GET retorna 405/Allow: POST,
sem limpar cookie ou alterar banco. Frontend migrou para POST e interceptor
Axios envia header nas mutações API same-origin. Clientes externos devem adaptar.

Helmet na API fornece CSP restritiva, nosniff, framing DENY e Referrer Policy.
Build funciona sob CSP própria no host E2E; hosting/TLS/HSTS reais não implantados.
FRONTEND_URL em produção exige HTTPS explícito válido e falha startup se ausente/
inválido. Configuração, headers/CSP exatos e limites: [SEGURANCA_HTTP.md](docs/SEGURANCA_HTTP.md).

## Contrato monetário — FET-DATA-001

Product create/update recebe `price`, `oldPrice`, `installmmentPrice` em decimal técnico (ponto, até duas casas). Backend deriva os campos Cents e ignora canônicos do cliente. Product retorna `priceCents`, `oldPriceCents`, `installmmentPriceCents` e strings de compatibilidade derivadas. Pedido recebe IDs/quantidades e ignora preços/totais client-side; retorna `orderItems[].priceCents`, `itemsPriceCents`, `taxPriceCents`, `shippingPriceCents`, `totalPriceCents`. Campos antigos de Order agora são strings exatas de apresentação. Admin/orders também retorna `totalAmountCents`.

Filtros `price[gt/gte/lt/lte]` mantêm decimal humano e comparação inteira. Ordenação por preço não existia e não foi adicionada. Documentos legados exatos possuem `moneyLegacy=true`; precisão/inconsistência causa erro controlado, sem arredondamento. Veja [DINHEIRO.md](docs/DINHEIRO.md). CSRF, autorização e no-store permanecem.


## FET-ORDER-003 — histórico comercial preservado (08/10/2026)

F011 / FET-P0-009 corrigido. DELETE administrativo de qualquer pedido retorna 405 com Allow: PATCH; não há exclusão física no fluxo comercial. PATCH /api/v1/admin/order/:id/archive e /unarchive são exclusivos para admin, com CSRF e metadata atômica. O painel filtra Ativos (padrão), Arquivados e Todos. Cliente mantém histórico completo, sem metadata administrativa. Arquivamento preserva centavos, snapshot, pagamento, estoque, ledger e replay. Pedidos legados não exigem migração. Auditoria somente leitura: npm.cmd run audit:orders --prefix ecommerce.

Detalhes: [Histórico de pedidos](docs/HISTORICO_PEDIDOS.md) e [Relatório FET-ORDER-003](docs/RELATORIO_FET_ORDER_003.md). F002 é a próxima recomendação, sem início automático.


## FET-ORDER-004 — contrato de status de pedido

PUT /api/v1/admin/order/:id consome somente status. Mesmo estado200 sem escrita; target inválido/ausente/não string400; inexistente404. Salto/retrocesso409 ORDER_STATUS_TRANSITION_INVALID; avanço sem paymentStatus PAID e paidAt válido409 ORDER_PAYMENT_NOT_CONFIRMED. Sequência é validada antes de pagamento. CAS protege estado e confirmação no write; Stock/ledger/archive não são alterados. Cliente/admin não confirmam pagamento por corpo. Nenhuma rota confirma pagamento até F001. Ver [Estados do pedido e pagamento](docs/ESTADOS_PEDIDO_PAGAMENTO.md).
