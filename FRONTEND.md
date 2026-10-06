# Interface com Material UI

O frontend utiliza um tema unico em `ecommerce/frontend/src/theme.js`:
paleta Fetech, tipografia legivel, espacamento, bordas e estados de foco.
Os estilos dos componentes seguem `ThemeProvider`, `CssBaseline` e `sx`.

## Telas atualizadas

- Cabecalho unico e fixo durante a navegacao, com busca, departamentos,
  quantidade no carrinho e menu de conta acessivel por teclado.
- Home com destaque visual e categorias; catalogo com cards de altura
  consistente, filtros, paginacao Material UI e skeletons no carregamento.
- Detalhe do produto com galeria responsiva, precos em reais, disponibilidade,
  controle de quantidade e formulario de avaliacao.
- Carrinho com resumo separado no desktop e empilhado no celular; botoes
  bloqueados durante a atualizacao de quantidade para evitar cliques repetidos.
- Login, cadastro, perfil e senhas com campos rotulados, autocomplete,
  visualizacao de senha e feedback durante o envio.
- Checkout e pedidos com resumo, endereco, etapas e estado do pagamento.
- Painel administrativo com indicadores, abas, formularios, tabelas com
  rolagem interna e dialogos de confirmacao de exclusao.
- Rodape, mensagens de erro, estados vazios e carregamento padronizados.

As telas carregam sob demanda com `React.lazy` e `Suspense`. O cabecalho
continua visivel enquanto a pagina carrega. Novas navegacoes comecam no
topo; voltar/avancar preservam o comportamento do navegador. Animacoes
respeitam a preferencia `prefers-reduced-motion`.

O CSS antigo e os componentes abandonados foram removidos. Icones,
paginacao e tipografia usam Material UI; `react-icons`, `react-js-pagination`
e `webfontloader` deixaram de ser necessarios.

## Validacao

A partir da raiz, com MongoDB local ativo:

```powershell
npm.cmd run build --prefix ecommerce/frontend
cd ecommerce
npm.cmd run test:e2e
cd frontend
npm.cmd audit --cache ../.npm-cache
```

Os testes cobrem os fluxos existentes de conta, catalogo, avaliacoes,
carrinho, checkout, pedidos e administracao. Tambem verificam layout em
360, 768 e 1440 pixels, ausencia de rolagem horizontal da pagina, menu por
teclado e exibicao de senha. Bancos de testes continuam isolados do banco
real `fetech`.

A aplicacao de desenvolvimento continua em http://localhost:3000 e o
build de producao fica em `ecommerce/frontend/build`.

Resultado: build aprovado sem aviso de bundle grande, 9 testes de
navegador aprovados, zero vulnerabilidades no `npm audit` do frontend.
As telas locais tambem foram conferidas visualmente no desktop e celular,
sem erros JavaScript ou avisos de propriedades invalidas no React.
