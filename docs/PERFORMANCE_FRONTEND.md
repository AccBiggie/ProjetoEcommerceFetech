# Performance frontend — FET-PERF-002 / F038

## Identificação e baseline

Finding original **F038 — Imagem hero e chunks sem orçamento operacional**,
categoria Performance frontend, LOW/P2. Confirmado na matriz `findingData` do
gerador original `.local/audit/create-report.cjs`: posição 38, regra
`F + (index + 1)`. O relatório histórico não está no worktree atual; o gerador
e suas evidências locais permanecem intactos. As referências posteriores a
F038 como tuning de queries não substituem a descrição original e não fecham
o custo residual de busca/escala. Nenhum finding foi renumerado.

Baseline desta task: main, HEAD `e6fcee5c460c7b13aafabf165595815e52f4c944`,
worktree limpo; F033 já commitada. Build pré-fix medido com a mesma versão Vite
8.3.3, manifest habilitado por override de teste e metadados de módulos, sem
alterar o runtime. [Bundles anteriores](PERF_BUNDLE_ANTES.json),
[rede anterior](PERF_REDE_ANTES.json), [bundles finais](PERF_BUNDLE_DEPOIS.json),
[rede/lab finais](PERF_REDE_DEPOIS.json).

## Inventário real

Entrypoint `src/index.jsx`: ReactDOM, HTTP/CSRF, recovery F031, Provider; importa
App e store dinamicamente. Store também é importada estaticamente por HTTP/App:
o aviso `INEFFECTIVE_DYNAMIC_IMPORT` já existia e a store está no entry. A
recuperação bootstrap é preservada. Router BrowserRouter em App, routes em
`src/routes.jsx`, guards ProtectedRoute; shell Header/Footer, main e skip link
persistentes. Redux clássico/thunks, reducers products/productDetails/user/
profile/forgotPassword/cart, middleware thunk; storage validado F031. MUI/theme
ColorModeProvider, CategoriesProvider central, ErrorBoundary envolve a aplicação.

| Rota/estado | Tipo | Import anterior → final | Chunk lógico | Dados iniciais da página |
|---|---|---|---|---|
| `/` | público | eager → eager | App + dependências compartilhadas | products página 1 |
| `/sad` | público | redirect → redirect | router/App | nenhum próprio |
| `/products`, `/products/:keyword` | público | lazy → lazy | Products | products página/filtro ativos |
| `/product/:id` | público | lazy → lazy | ProductDetails + carousel | product por id |
| `/search` | público | eager → eager | Search/Page compartilhados | nenhum; submit navega para catálogo |
| `/login` | público | lazy → lazy, named export adaptado | LoginSignUp/FormLayout | nenhum próprio |
| `/password/forgot` | público | lazy → lazy | ForgotPassword/FormLayout | nenhum próprio |
| `/password/reset/:token` | público | lazy → lazy | ResetPassword/FormLayout | nenhum próprio |
| `/cart` | público | lazy → lazy | Cart/QuantityControl | Redux/storage; sem GET adicional |
| `/account` | privado | lazy → lazy | Profile | usuário do Redux |
| `/account/privacy` | privado | lazy → lazy | Privacy | request de anonimização + overview em paralelo |
| `/addresses` | privado | lazy → lazy | Addresses/addressApi | endereços do usuário |
| `/me/update` | privado | lazy → lazy | UpdateProfile/FormLayout | usuário do Redux/avatar |
| `/password/update` | privado | lazy → lazy | UpdatePassword/FormLayout | nenhum próprio |
| `/shipping` | privado | lazy → lazy | Shipping/Stepper/addressApi | endereço via SavedAddressPicker; tentativa F005 em storage |
| `/orders` | privado | lazy → lazy | Orders/DataTable | orders/me página ativa, limite 25 |
| `/order/:id` | privado | lazy → lazy | OrderDetails | order por id |
| `/dashboard` | admin | lazy → lazy | Dashboard/CategoriesManager | antes: 3 listas; agora: apenas lista da aba ativa |
| dashboard: categorias | admin | eager dentro Dashboard → mantido | CategoriesManager | contexto de categorias; sem reconstrução de páginas |
| dashboard: auditoria | admin | eager dentro Dashboard → lazy | AuditTrail/DataTable | audit-events página ativa, limite 25 |
| dashboard: privacidade | admin | eager dentro Dashboard → lazy | PrivacyRequests | privacy/requests página/status ativos, limite 25 |
| `*` | público | eager → eager | NotFound/Page | nenhum próprio |

Em todas as rotas, o shell consulta `/me` uma vez e `/categories` uma vez por
boot. `/me` anônimo responde 401 esperada. Endereços são limitados pelo contrato
existente. Nenhuma lista busca todas as páginas. Detalhe de pedido depende do
id; privacidade dispara consultas independentes em paralelo. Não foi observado
waterfall desnecessário que justifique antecipar requests de outros domínios.

## Problemas observados e itens já protegidos

Hero PNG de 1.068.973 bytes e ausência de orçamento: reproduzidos. Search no
shell importava AccessibleTextField/TextField, trazendo dependências de
formulário mais amplas. Dashboard carregava os módulos AuditTrail e
PrivacyRequests antes de abrir as abas; seus efeitos ainda eram condicionais.
Ao entrar no dashboard, três listas eram consultadas; mudar página/filtro
refazia as três via Promise.all. Agora cada lista consulta somente a aba ativa,
com limite 25 e resposta antiga/abort protegidos. Contagens das outras abas
exibem `—` até serem consultadas; a interface explica esse comportamento.

**JÁ PROTEGIDO antes da task:** router de produto/auth/cliente/admin lazy,
admin fora da Home, cartões lazy com área fixa, paginação F022, search somente
submit, categorias centralizadas/memoizadas, ErrorBoundary/bootstrap e
preservação de storage F031, guards e foco/títulos F033. Nenhum desses itens foi
apresentado como nova correção.

## Grafo e splitting

`index.html → entry JS → imports estáticos`; o bootstrap chama **App**
imediatamente, por isso `src/App.jsx` e sua closure estática **também são
initial**, apesar do dynamic import. As rotas restantes e as abas secundárias
são lazy. O auditor percorre `imports`, deduplica arquivos compartilhados e
separa `dynamicImports`/entries das rotas. CSS initial segue os nós iniciais.
Não soma todos os chunks lazy ao initial. Proveniência `.vite/modules.json`
vem dos módulos reais do bundler, sem código fonte ou caminhos absolutos.

Sem manualChunks ou prefetch global. O splitting natural cria 42 chunks JS
totais, 11 iniciais, contra 36/9 antes; seis chunks adicionais refletem as duas
abas e redistribuição de componentes compartilhados. A diminuição do payload
inicial é mais relevante que somar todos os futuros caminhos de navegação.
Search agora usa OutlinedInput com nome acessível e submit preservado; não
precisa de validação obrigatória/Select/TextField no shell.

Suspense mantém Loader, role=status, altura mínima 260, sem foco automático.
Fallback de página tem h1 transitório, ignorado pelo gerenciador de foco;
loaders dentro de páginas/abas mantêm parágrafo para não duplicar h1.
Em navegação SPA o router pode manter a tela anterior enquanto a
transição aguarda o chunk; em acesso direto o fallback é verificável. As abas
secundárias têm Suspense local, preservando título/nav e main do painel.
Títulos, back/forward, skip link e foco continuam F033. Rejeição de chunk é
capturada pelo ErrorBoundary F031, com recuperação e storage preservado.

## Consultas, Strict Mode e renderização

Nenhuma request duplicada de catálogo/detalhe foi observada no mount normal
pré-fix. Produção já não envolvia App em StrictMode; nada foi removido para
ocultar duplicidade. `latestRead` protege leituras pendentes iguais por chave e
dispatch, inclusive replay de efeitos no Strict Mode de desenvolvimento.
Mudança de chave aborta a anterior e só a identidade atual pode publicar sucesso
ou erro. O detalhe também passa a ter essa proteção. Falha/conclusão libera a
entrada para retry/refetch; não há cache de respostas concluídas. Mutations
e idempotência comercial não passam por esse helper.

Harness **exclusivamente E2E** usa React de desenvolvimento + StrictMode:
efeito executado duas vezes, um GET de catálogo e um GET de detalhe. Não entra
em rotas/build de produção. StrictRead é módulo dinâmico do cenário específico;
o entry do recovery não importa store nem normaliza storage legado.
F005 mantém submit único e replay persistente;
F031 mantém storage safety. F022 mantém a página solicitada e descarta
resposta antiga, coberto por testes de catálogo/admin/orders.

Não foram adicionados memo/useCallback/React.memo por especulação. As listas
renderizam somente a página atual, keys por ID, preços/descontos/ratings vêm
do servidor F014/F015/F037. O filtro pequeno de categorias na Home não
justifica cache complexo ou virtualization. MUI possui imports nomeados; os
ícones usados têm imports individuais. Não há `import * as Icons`.

## Imagens, fontes e CSS

| Uso | Política final | Espaço reservado |
|---|---|---|
| hero Home | WebP local, eager, **uma** high priority | 200px móvel / 380px desktop, cover |
| cards | lazy + decoding async, alt mantido | container 200px, imagem contain até 150px |
| detalhe | primeira eager; restantes lazy; decoding async | 250px móvel / 350px desktop, contain |
| avatar | comportamento MUI e tamanhos existentes mantidos | Avatar dimensionado; lifecycle/upload intocado |
| logos | eager existente, arquivo SVG local | largura explícita existente |

Hero local reencodificada com sharp **já instalado**, WebP quality 82/effort 6,
1920×360 preservados; 88.358 bytes, redução **91,73%**. PNG original preservado
como fonte local, sem import no build final. Variante final inspecionada
visualmente. Nos probes pré-fix a hero foi candidata LCP em 360 e 1440px, motivo
factual para prioridade high. Não se marcou uma série de produtos como high.
Detalhe não recebe high sem profiling específico. Container fixa espaço antes
do download; teste bloqueia imagens e compara altura antes/depois.

Não há srcSet/sizes inventados nem fontes reais de múltiplas resoluções. Nenhuma
transformation Cloudinary, request ao provider ou download externo em testes.
O browser pode baixar imagens lazy fora da viewport por proximidade; evidência
registra **política estrutural e requests observados**, sem prometer ausência
de download offscreen. Os PNGs demo em public continuam disponíveis; o auditor
também os mostra, sem fingir que o budget da hero limita imagens futuras de
produtos fornecidas pelo backend.

Fonte: stack `Inter, Segoe UI, Roboto, Arial, sans-serif`; Inter/Roboto só se
presentes no sistema, sem import remoto/font files/font weights baixados.
CSS initial 1.706 bytes raw / 830 gzip, carousel CSS permanece lazy. Foco,
contraste, dark mode e reduced motion F033 preservados. Sourcemaps de produção
já desativados pelo padrão Vite e assim permanecem; compressão HTTP não alterada.

## Métricas e orçamento

| Métrica (bytes salvo contagens) | Antes | Depois | Diferença |
|---|---:|---:|---:|
| initial JS raw | 679316 | 648394 | -30922 |
| initial JS gzip | 220428 | 213472 | -6956 (-3,16%) |
| entry JS gzip | 93759 | 93792 | +33 |
| initial CSS raw | 1706 | 1706 | 0 |
| initial CSS gzip | 830 | 830 | 0 |
| largest lazy/route chunk gzip | 11192 | 11260 | +68 |
| dashboard route chunk gzip | 6690 | 5722 | -968 |
| initial JS chunk count | 9 | 11 | +2 |
| total JS chunk count | 36 | 42 | +6 |
| hero raw | 1068973 | 88358 | -980615 |

Raw/gzip de cada asset e origem real dos módulos estão nos JSONs ligados acima;
gzip usa zlib.gzipSync, não as estimativas arredondadas do terminal Vite.

```powershell
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run audit:bundle --prefix ecommerce/frontend
npm.cmd run ci:bundle-budget --prefix ecommerce/frontend
```

`audit:bundle` e `ci:bundle-budget` são **READ_ONLY sobre build local**: não
constroem, modificam assets ou imprimem source content. Sem build/metadados
esperados falham fechado. A saída inclui entry/initial, route chunks, raw/gzip,
CSS e maiores assets manifest/public. Hashes nunca são usados como identidade.

Config: `ecommerce/frontend/bundle-budget.json`. Initial JS gzip tem **2,5%** de
margem: 218809 bytes, abaixo do baseline antigo; reversão da melhoria deve
falhar. Demais bytes JS/CSS: +5%, escolhidos para pequenas variações do bundler.
Hero: 100000 bytes (+13,2%, ainda distante de 1MiB anterior). Contagens: initial
até 13, total até 48, margem de poucos nós compartilhados, sem centenas de
microchunks. Maior rota <=11823 gzip; dashboard/admin <=6009. Módulos admin,
privacy cliente e checkout são proibidos no initial e os 17 dynamic entries
escolhidos são obrigatórios. Mudança justificada exige nova medição/revisão,
não recalcular o orçamento automaticamente no CI.

Commercial Gate executa build **uma vez**, seguido de budget no mesmo build.
O job build do workflow existente passa a exigir esse check por `ci:build`;
E2E também usa esse estágio. Arquitetura inclui parser/budget e boundaries de
imports. Aggregate continua exigindo os seis jobs. **F039 remoto não validado**.

## Limites

LCP/CLS locais são diagnósticos sem gate temporal, armazenados nos anexos
Playwright/relatório. INP/INP proxy não medido. **lab measurement != field Core
Web Vitals**: não representam field Core Web Vitals de produção. Não há
Lighthouse/RUM/analytics novos ou promessa de score/tempo. CPU/cache/carga local
variam; os gates são bytes, grafo, requests e comportamento observável.

CDN/cache headers/compressão/deployment dependem de F023. SEO é independente;
transformations avançadas dependem da arquitetura real do provider. Novas
features podem aumentar bundles e exigem revisar budgets com evidência.
F024/F026 parciais, F029 aberto, F039 remoto pendente; F022/F037 índices
comerciais pendentes. Pagamento F001/frete F027 não iniciados. F030/F033 são
baselines técnicos, F040 no código com SMTP real não validado. Banco `fetech`,
SMTP, Cloudinary, config.env e índices reais não foram usados/alterados.

Referências técnicas: [manifest Vite](https://vite.dev/guide/backend-integration),
[React lazy](https://react.dev/reference/react/lazy),
[Suspense](https://react.dev/reference/react/Suspense).
