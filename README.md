# ProjetoEcommerceFetech

## Executar localmente no Windows

O mapa das rotas, permissoes, integracoes e testes de ponta a ponta esta
em [ROTAS.md](ROTAS.md).

O projeto usa React (porta 3000), Node/Express (porta 4000) e MongoDB
(porta 27017). WSL e Docker nao sao obrigatorios. Foi validado com Node
24.19.0, npm 11.17.0 e MongoDB Community 8.0.26 nativo no Windows.

Os comandos de instalacao, configuracao, inicializacao e verificacao estao
em [COMANDOS.md](COMANDOS.md). Use `npm.cmd` no PowerShell para evitar a
restricao de execucao de `npm.ps1`.

Copie `ecommerce/backend/config/config.env.example` para `config.env` na
mesma pasta e configure uma chave JWT aleatoria. O arquivo real fica fora
do Git. O backend so abre a porta depois de conectar ao MongoDB.

Abra http://localhost:3000. O banco de uma instalacao nova inicia vazio.
Depois de criar o administrador `admin@fetech.local`, execute
`npm.cmd run seed:products` na pasta `ecommerce` para cadastrar um produto
de exemplo em cada uma das 11 categorias do menu. O comando pode ser
repetido sem duplicar ou alterar os exemplos existentes. As imagens ficam
em `frontend/public/demo-products`; categorias sem foto propria usam o
logo da loja como ilustracao. Precos e descricoes sao ficticios.

Cadastro sem foto funciona com o avatar padrao. Cadastro com avatar requer credenciais Cloudinary; recuperacao
de senha requer SMTP no `config.env`. Essas integracoes nao foram
validadas sem as credenciais. O projeto possui dependencias antigas e a
compilacao pode apresentar avisos de descontinuacao e lint.

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


