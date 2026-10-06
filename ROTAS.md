# Revisao das rotas e dos fluxos

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
| `/me/update` | Atualiza nome, e-mail e avatar opcional |
| `/password/update` | Altera senha autenticada |
| `/shipping` | Endereco e criacao do pedido autenticado |
| `/orders` | Pedidos do cliente autenticado |
| `/order/:id` | Detalhe do pedido; disponivel para o proprietario e o administrador |
| `/dashboard` | Administracao de produtos, usuarios e pedidos; exclusivo para `admin` |
| `/sad` | Redireciona para o inicio; evita a antiga tela de carregamento permanente |
| demais URLs | Pagina nao encontrada, com acesso ao catalogo |

As 11 categorias agora compartilham o mesmo arquivo
`ecommerce/frontend/src/data/categories.json`, usado pelo menu, filtro,
formulario administrativo e cadastro de exemplos.

## API

Todas as rotas abaixo usam o prefixo `/api/v1`.

| Metodo | Rota | Acesso |
| --- | --- | --- |
| GET | `/products`, `/product/:id`, `/reviews?id=:productId` | Publico |
| POST | `/register`, `/login`, `/password/forgot` | Publico |
| PUT | `/password/reset/:token` | Token de recuperacao valido |
| GET | `/logout` | Encerra cookie da sessao |
| GET | `/me` | Autenticado |
| PUT | `/me/update`, `/password/update` | Autenticado |
| PUT | `/review` | Autenticado; uma avaliacao por usuario/produto |
| DELETE | `/reviews?productId=:productId&id=:reviewId` | Autor da avaliacao ou administrador |
| POST | `/order/new` | Autenticado |
| GET | `/orders/me` | Autenticado, somente os proprios pedidos |
| GET | `/order/:id` | Proprietario ou administrador |
| GET | `/admin/products`, `/admin/users`, `/admin/orders`, `/admin/user/:id` | Administrador |
| POST | `/product/new` | Administrador |
| PUT, DELETE | `/product/:id`, `/admin/user/:id`, `/admin/order/:id` | Administrador |

IDs invalidos e formularios invalidos retornam 400; recursos inexistentes
e rotas desconhecidas retornam 404. Sessoes ausentes, invalidas, expiradas
ou de usuarios removidos retornam 401. Acesso sem permissao retorna 403.

O total do pedido e calculado no servidor pelos precos cadastrados, sem
aceitar o total ou o status de pagamento enviado pelo navegador. O estoque
e reduzido na transicao `Processing -> Shipped`, com as operacoes aguardadas
e compensacao se um item falhar. `Shipped -> Delivered` registra a entrega
sem descontar estoque novamente. Alteracoes concorrentes do mesmo pedido
usam a verificacao de versao do Mongoose.

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
8 fluxos de navegador passaram, incluindo o carrossel com duas imagens.
O build com Vite foi concluido. A loja ativa
em `http://localhost:3000` tambem foi conferida no navegador, com filtro
e menu funcionando, API respondendo 200, rota administrativa exigindo
autenticacao e nenhum erro JavaScript nessa verificacao.
