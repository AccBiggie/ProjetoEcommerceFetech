# Dependencias atualizadas

Versoes estaveis consultadas no registro oficial do npm em 06/10/2026.
Os manifests usam as versoes `latest` sem prereleases; os lockfiles fixam
a arvore instalada. Dependencias transitivas respeitam os intervalos dos
pacotes que as utilizam.

## Principais versoes

| Biblioteca | Versao instalada |
| --- | --- |
| React / React DOM | 19.3.0 |
| Vite | 8.3.3 |
| Plugin React do Vite | 6.1.2 |
| Material UI / icones | 9.4.0 |
| React Router | 8.4.0 |
| React Redux | 9.3.0 |
| Redux / Redux Thunk | 5.0.1 / 3.1.0 |
| Axios | 1.20.0 |
| Embla Carousel React | 8.6.0 |
| React Hot Toast | 2.6.1 |
| Express | 5.2.1 |
| Mongoose | 9.11.0 |
| bcryptjs | 3.0.3 |
| JSON Web Token | 9.0.3 |
| Cloudinary | 2.11.0 |
| Nodemailer | 10.0.15 |
| dotenv | 18.0.5 |
| Playwright | 1.63.0 |

As demais dependencias diretas tambem foram conferidas e atualizadas;
`webfontloader` continua em 1.6.28, a ultima versao publicada.

## Migracoes

- Create React App foi substituido por Vite. O HTML de entrada fica em
  `ecommerce/frontend/index.html`, componentes usam `.jsx`, o proxy `/api`
  aponta para `127.0.0.1:4000` e o build continua em `frontend/build`.
- Material UI 4 e seu laboratorio foram substituidos por Material UI 9.
  SpeedDial usa `slotProps`, icones usam o pacote atual e estrelas usam Rating.
- `react-alert` e seu template foram substituidos por React Hot Toast;
  o carrossel antigo foi substituido por Embla, com controles e gestos.
- React Router usa `react-router`, pois o pacote de reexportacao
  `react-router-dom` foi removido na linha 8.
- Redux Thunk utiliza export nomeado; Redux DevTools utiliza
  `@redux-devtools/extension`. Metadados usam o suporte nativo do React 19.
- Express 5 recebe o parser de query `extended` para preservar filtros como
  `price[gte]`. O servidor de testes usa o novo wildcard `/{*path}`.
- Mongoose utiliza `deleteOne` e `returnDocument: 'after'`.
- Nodemon foi substituido pelo `node --watch` nativo. Body Parser foi
  substituido por `express.urlencoded`; upload multipart foi preservado.
- Pacotes sem uso foram removidos: CoreUI, navegacoes antigas, social icons,
  React Modal, Styled Components, Web Vitals e Testing Library. Os testes
  existentes usam Node e Playwright.
- `.npmrc` com `legacy-peer-deps=true` foi removido. A instalacao valida
  os requisitos de compatibilidade normalmente.

## Executar e verificar

Use Node 24.19 ou superior na linha 24 LTS e npm 11, com MongoDB local ativo.
Os comandos abaixo partem da raiz do repositorio:

```powershell
cd ecommerce
npm.cmd ci --no-fund --cache .npm-cache
npm.cmd test
npm.cmd audit --cache .npm-cache
npm.cmd outdated --cache .npm-cache
cd frontend
npm.cmd ci --no-fund --cache ../.npm-cache
npm.cmd run build
npm.cmd audit --cache ../.npm-cache
npm.cmd outdated --cache ../.npm-cache
cd ..
npm.cmd run test:e2e
```

Para iniciar, execute `npm.cmd start` em `ecommerce` e em
`ecommerce/frontend`, em terminais separados. `npm.cmd run dev` no backend
reinicia a API automaticamente quando seus arquivos mudam. A loja continua
em http://localhost:3000. `API_PROXY_TARGET` pode alterar o destino do proxy
no ambiente ou em um arquivo `.env.local` do frontend.

Referencias: [descontinuacao do CRA](https://react.dev/blog/2025/02/14/sunsetting-create-react-app),
[Express 5](https://expressjs.com/en/guide/migrating-5/),
[Mongoose 9](https://mongoosejs.com/docs/migrating_to_9.html),
[Material UI 9](https://mui.com/material-ui/migration/upgrade-to-v9/),
[React Router 8](https://reactrouter.com/upgrading/v7).

## Comandos utilizados nesta atualizacao

Na pasta `ecommerce`, foram executados `npm.cmd install --no-fund --cache
.npm-cache` e `npm.cmd audit fix --no-fund --cache .npm-cache`. O alerta
restante vinha do watcher do Nodemon; a troca por `node --watch` eliminou
essa dependencia, sem forcar uma versao antiga. Na pasta `frontend`, foram
executados `npm.cmd install --no-fund --cache ../.npm-cache` e
`npm.cmd prune --no-fund --cache ../.npm-cache`.

Foram usados `npm.cmd ls --depth=0`, `npm.cmd outdated`, `npm.cmd audit`
e `npm.cmd ci --dry-run --ignore-scripts --no-audit --no-fund` nas duas
pastas, sempre com o cache local. Os comandos de build e testes estao acima.

Resultado: 8 grupos da API e 8 testes no navegador passaram; manifests e
lockfiles consistentes; nenhuma dependencia direta desatualizada segundo
`npm outdated`; zero vulnerabilidades conhecidas segundo `npm audit` nas
duas arvores. O build produz um aviso de bundle acima de 500 kB, sem impedir
a compilacao. SMTP e Cloudinary continuam simulados nos testes; contas
externas reais precisam de suas respectivas credenciais.

A API e o servidor Vite foram reiniciados. A verificacao da loja ativa
confirmou listagem, detalhe do produto e proxy HTTP 200, sem erros
JavaScript ou avisos de propriedades invalidas no navegador.
