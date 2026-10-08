# ProjetoEcommerceFetech

## Executar localmente no Windows

O mapa das rotas, permissoes, integracoes e testes de ponta a ponta esta
em [ROTAS.md](ROTAS.md).

A autenticação usa `User.tokenVersion` para revogar JWTs server-side após
logout, troca e reset de senha. Logout revoga todas as sessões da versão atual;
JWTs antigos sem versão são rejeitados e exigem novo login após o deploy.
Política, concorrência, compatibilidade e testes: [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).
Remediações pós-auditoria: [docs/PLANO_MELHORIAS_FETECH.md](docs/PLANO_MELHORIAS_FETECH.md).

F021 foi corrigido na FET-SEC-006: cadastro, login, troca/reset de senha
retornam `success` e `user`, sem JWT no JSON. A sessão permanece no cookie
HttpOnly. Respostas autenticadas, emissão de sessão e logout usam
`Cache-Control: no-store`; catálogo público preserva seu comportamento de cache.
Clientes externos que dependiam de `body.token` precisam ser atualizados;
sessões existentes não são revogadas apenas por esta mudança.

F020 foi corrigido no código pela FET-SEC-007: Helmet/CSP na API, política CSP
do build validada no host E2E e defesa CSRF/Origin explícita. Mutações em
`/api/v1` exigem `X-Fetech-CSRF: 1`; frontend envia automaticamente. Logout
agora usa POST; GET retorna 405 sem encerrar sessão. HTTPS/HSTS e hosting real
permanecem na F023. Veja [docs/SEGURANCA_HTTP.md](docs/SEGURANCA_HTTP.md).

Login, recuperação, reset e cadastro possuem rate limiting compartilhado no
MongoDB, com limites temporários por IP/conta, HTTP 429 e `Retry-After`.
As chaves são derivadas por HMAC; o backend não confia automaticamente em
`X-Forwarded-For`. F009 foi corrigido: recuperação retorna 200 e mensagem genérica
para conta existente, inexistente e falha SMTP; falha de envio limpa o token.
`AUTH_FORGOT_MIN_RESPONSE_MS` é opcional (300 ms por padrão), reduz diferenças
triviais de tempo; latência SMTP externa permanece um risco residual para F040.

F007 foi corrigido na FET-SEC-005: cookie `token` centralizado, HttpOnly,
SameSite=Lax, Path=/ e sem Domain. `NODE_ENV=production` impõe Secure;
desenvolvimento/teste continuam por HTTP. Produção exige HTTPS real, ainda
não implantado. `TRUST_PROXY_HOPS` ausente/0 mantém confiança desativada;
1..5 exigem topologia conhecida e proxy que saneie headers encaminhados.
Configuração inválida de proxy ou duração do cookie impede iniciar a API.
Detalhes e limitações: [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

O layout responsivo e os componentes Material UI estao documentados em
[FRONTEND.md](FRONTEND.md).

A interface tem tema claro e escuro, alternado pelo botão de sol/lua no
cabeçalho. A primeira visita segue o tema do sistema; a escolha manual é
salva no navegador e preservada nas próximas visitas.

Usuários autenticados podem cadastrar vários endereços em **Meus endereços**,
nas ações do perfil e no menu da conta. O cadastro possui favorito único por
usuário e mantém CEP/telefone como strings. Na entrega, cards dos endereços
cadastrados permitem preencher os campos atuais, mantendo edição manual e
snapshot do pedido. Veja [docs/ENDERECOS.md](docs/ENDERECOS.md)
e [o estado atual do projeto](docs/ESTADO_ATUAL_PROJETO_FETECH.md).

Novos pedidos usam entrega estruturada versionada, CEP/telefone strings e
validação estrita de quantidade, preservando zeros iniciais. Há auditoria
histórica somente leitura; ela não foi executada no banco comercial.
Contrato e operação: [docs/VALIDACAO_CHECKOUT.md](docs/VALIDACAO_CHECKOUT.md).

Categorias possuem CRUD próprio e subcategorias vinculadas por `parent_id`.
No dashboard, o botão **Cadastrar categoria** abre o painel lateral de
criação/edição; a aba **Categorias** permite gerenciar os vínculos.
Veja [docs/CATEGORIAS.md](docs/CATEGORIAS.md) para API, migração e uso.

O projeto usa React (porta 3000), Node/Express (porta 4000) e MongoDB
(porta 27017). WSL e Docker nao sao obrigatorios. Foi validado com Node
24.19.0, npm 11.17.0 e MongoDB Community 8.0.26 nativo no Windows.

Os comandos de instalacao, configuracao, inicializacao e verificacao estao
em [COMANDOS.md](COMANDOS.md). Use `npm.cmd` no PowerShell para evitar a
restricao de execucao de `npm.ps1`.

O comando de MongoDB documentado resolve o executável e os dados por caminhos
absolutos da raiz do projeto; pode ser usado mesmo com o terminal aberto em
`ecommerce` ou `frontend`. Reutilize `.local/mongo-data` da raiz para manter
os dados existentes.

Copie `ecommerce/backend/config/config.env.example` para `config.env` na
mesma pasta e configure uma chave JWT aleatoria. O arquivo real fica fora
do Git. O backend so abre a porta depois de conectar ao MongoDB.

Abra http://localhost:3000. O banco de uma instalacao nova inicia vazio.
Crie o primeiro administrador com `npm.cmd run admin:bootstrap --prefix ecommerce`
em terminal interativo: confirme o nome do banco e informe dados próprios,
com senha oculta e sem credenciais padrão. O comando funciona somente com
zero admins e recusa e-mail já cadastrado. Depois faça login normalmente.
Proteções de autoexclusão, autorrebaixamento e último admin estão no backend,
com lock compartilhado e geração de escrita. Veja [docs/ADMINISTRACAO.md](docs/ADMINISTRACAO.md).
Depois de criar o administrador, execute
`npm.cmd run seed:products` na pasta `ecommerce` para cadastrar um produto
de exemplo em cada uma das 11 categorias do menu. O comando pode ser
repetido sem duplicar ou alterar os exemplos existentes. As imagens ficam
em `frontend/public/demo-products`; categorias sem foto propria usam o
logo da loja como ilustracao. Precos e descricoes sao ficticios.

Cadastro sem foto funciona com o avatar padrao. Cadastro com avatar requer credenciais Cloudinary; recuperacao
de senha requer SMTP no `config.env`. Essas integracoes nao foram
validadas sem as credenciais. As dependencias foram atualizadas para as
versoes estaveis do npm em 06/10/2026. O frontend usa Vite, React 19 e
Material UI 9; a API usa Express 5 e Mongoose 9. Use Node 24.19 ou superior
na linha 24 LTS e npm 11. A instalacao nao requer `legacy-peer-deps`.
Veja [DEPENDENCIAS.md](DEPENDENCIAS.md) para as migracoes e verificacoes.

O MongoDB baixado e seus dados ficam em `.local/`, fora do Git. Ele usa
apenas a interface local. Os comandos abaixo sao para desenvolvimento local.

 Projeto Fetech Hardware && Technology
## Projeto consistirá em uma loja virtual.

O projeto irá ser implementado com as seguintes tecnologias = NodeJS, Express, ReactJS, MongoDB, Redux e API REST.

Backend = () => {
    #01-Criar um servidor node para API de produto;
    #02-Criar API de produto, usuário, login, register, loggout, API nodemailer "Esqueceu sua senha";
    #03-Conexão com banco de dados "MongoDB";
    #04-Tokens de validação JWT;
    #05-PedidoController;
}

Frontend = () => {
    #01-Iniciar implementação Fronted com ReactJS;
    #02-Implementar Redux;
    #04-Frontend produtos, footer, listagem de produtos, pesquisa de produtos, filtro produtos e barra de navegação;
    #04-Implementar Filtros no front;
    #05-Front login e registro component;
}



## Configuração central e startup seguro (FET-SEC-008)

O backend valida ambiente, Mongo, JWT, cookie, origin, proxy e grupos externos antes de conectar ou aceitar tráfego. Configuração inválida encerra com erro agregado sem secrets. Veja [CONFIGURACAO.md](docs/CONFIGURACAO.md) para inventário, defaults, perfis server/bootstrap/seed e migração de configurações antigas. Nenhuma dependência nova.

## Modelo monetário em centavos (FET-DATA-001)

Product, snapshots Order e cálculos de carrinho/checkout usam centavos inteiros. A API preserva campos decimais como strings derivadas; valores com mais de duas casas são recusados. Veja [DINHEIRO.md](docs/DINHEIRO.md) e [migração manual](docs/MIGRACAO_DINHEIRO_CENTAVOS.md). Banco real ainda não migrado.
