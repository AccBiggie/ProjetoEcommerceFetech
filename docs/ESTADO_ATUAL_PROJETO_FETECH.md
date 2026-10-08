# Estado atual — ProjetoEcommerceFetech

Referência em 07/10/2026 para continuidade do projeto. O código e os lockfiles
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
sem claim são rejeitados e exigem novo login após deploy. Sessões por dispositivo,
rate limiting, Secure cookie, MFA e hardening HTTP/CSRF continuam pendentes.
Detalhes em [AUTENTICACAO.md](AUTENTICACAO.md) e
[PLANO_MELHORIAS_FETECH.md](PLANO_MELHORIAS_FETECH.md).

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
mantém `Order.shippingInfo` como snapshot, com o contrato histórico atual.
Os cards na entrega copiam os dados de `Address` para os campos editáveis do
formulário, sem selecionar um endereço automaticamente. O endpoint do pedido
recebe os dados finais, preservando o snapshot. Editar um campo passa a indicar
preenchimento manual. Pedidos não dependem permanentemente de `Address`, e
editar/excluir o cadastro não altera snapshots existentes. Falha ao consultar
os cards permite continuar com preenchimento manual.

Pedidos são criados com pagamento `Pending`, sem cobrança, frete ou impostos
integrados. Preços são calculados pelo backend. Estoque é descontado na
transição `Processing -> Shipped`, com compensação em falha, e entrega usa
`Shipped -> Delivered`. Não reescrever esses contratos sem uma tarefa específica.

SMTP e Cloudinary dependem de credenciais reais; os testes usam substituições
isoladas. Não há gateway de pagamento, transportadora, frete, rastreamento
ou publicação de produção confirmada nesta referência.

## Continuidade e verificação

Usar componentes Material UI, tema compartilhado, português, BRL, rotas
existentes e middleware de autenticação. Não expor segredos ou executar testes
destrutivos no banco real. Usar bancos temporários existentes para testes.

Comandos obrigatórios: `npm.cmd test --prefix ecommerce`,
`npm.cmd run build --prefix ecommerce/frontend` e
`npm.cmd run test:e2e --prefix ecommerce`. A suíte atual contém 41 testes da
API e 19 fluxos E2E, incluindo endereços e seleção na entrega em 360, 768 e
1440 px e modo escuro.

Resultado após integrar a seleção de endereços na entrega (antes de FET-SEC-001): **13 testes da API
aprovados, build aprovado e 19 testes E2E aprovados**, em 07/10/2026.

Resultado de FET-SEC-001 em 07/10/2026: **28/28 testes focados, 41/41 testes
da API, build aprovado e 19/19 E2E**. Testes e probes executados exclusivamente
em bancos temporários com teardown; banco real não alterado. JWTs antigos
sem versão exigirão novo login quando a nova API for iniciada.

Documentos complementares: `README.md`, `COMANDOS.md`, `ROTAS.md`, `FRONTEND.md`,
`DEPENDENCIAS.md` e `docs/ENDERECOS.md`.
