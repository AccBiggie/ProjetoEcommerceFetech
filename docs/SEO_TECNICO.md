# SEO técnico — FET-SEO-001 / F032

Status: **PARCIAL — PRODUÇÃO/INDEXABILIDADE DEPENDE DE F023**.
Baseline client-side implementado; produção não comprovada. Nenhuma dependência npm nova.

## Finding factual

F032: **Metadados específicos e compartilhamento incompletos**. Registro histórico
de 07/10/2026 em `.local/audit/create-report.cjs`, linha 45, posição 32 de
`findingData`; o gerador atribui IDs pela posição. Não é F034 (analytics).
Descrição original: “Title dinâmico e description genérica; sem canonical/sitemap/OG/Twitter/Product schema; manifest ainda CRA.”
O arquivo histórico não foi alterado nem executado. Os relatórios originais não estão no worktree.

## Deployment inventory

| Item | Estado factual | Fonte |
|---|---|---|
| Frontend hosting de produção | Não definido/comprovado no repositório | Vite, árvore Git e F023 |
| Backend hosting de produção | Não definido/comprovado | `backend/server.js`, F023 |
| Frontend servido pelo Express da aplicação | NÃO; apenas rotas API e 404 | `backend/app.js` |
| Saída do frontend | SPA estática em `frontend/build` | `frontend/vite.config.mjs` |
| Proxy local | `/api` para API local; `API_PROXY_TARGET` opcional | `vite.config.mjs` |
| Reverse proxy, TLS, CDN e fallback produtivos | Não comprovados | F023 |
| `FRONTEND_URL` | Configuração exclusiva do backend: CSRF e links de e-mail | `backend/config/runtimeConfig.js`, `csrf.js` |
| Config frontend anterior de origem pública | Nenhuma encontrada nos consumidores `src`/Vite | Inventário de nomes `VITE_*` |
| Nova configuração opcional | `VITE_PUBLIC_SITE_URL`, origem HTTPS validada no Vite e no helper | `vite.config.mjs`, `seo/metadata.mjs` |
| Public canonical origin formal | **NÃO**; nenhuma decisão formal versionada | Inventário acima |
| robots | Arquivo estático copiado no build; permite crawl | `frontend/public/robots.txt` |
| sitemap | Ausente; `BLOCKED_BY_DEPLOYMENT` / `BLOCKED_BY_F023` | `seo/metadata.mjs`, auditoria offline |
| Host E2E | Express isolado serve build com fallback HTTP 200; não é produção | `tests/e2e/server.js` |

O inventário usa código e nomes de configuração. Não lê valores de `config.env`,
não imprime credenciais e não consulta o banco nem serviços reais.

## Matriz de indexabilidade

`C` = canonical somente quando uma origem pública autorizada estiver configurada.
Sem origem, canonical e `og:url` são omitidos. INDEX descreve a política client-side,
não comprova indexação por crawler. NOINDEX usa `noindex,follow`.

| Rota | Index | Robots meta | Canonical | JSON-LD |
|---|---|---|---|---|
| `/` | INDEX | index,follow | C `/` | — |
| `/sad` | CONDITIONAL, redireciona para Home | herda Home | destino | — |
| `/products` sem busca/filtro/página | INDEX | index,follow | C `/products` | — |
| `/products?category=…` | CONDITIONAL, sem política comercial de indexação | noindex,follow | — | — |
| `/products?page=…` | CONDITIONAL, paginação sem política comercial de indexação | noindex,follow | — | — |
| `/products?keyword=…` | NOINDEX, busca arbitrária | noindex,follow | — | — |
| `/products/:keyword` | NOINDEX, busca legada | noindex,follow | — | — |
| `/search` | NOINDEX, busca arbitrária | noindex,follow | — | — |
| `/product/:id` existente/carregado | CONDITIONAL → INDEX | index,follow | C `/product/:id` real | Product/Offer/agregado válido |
| `/product/:id` ausente/erro/loading/ID inválido | NOINDEX | noindex,follow | — | — |
| `/account` | NOINDEX, perfil privado | noindex,follow | — | — |
| `/account/privacy` | NOINDEX, direitos privados | noindex,follow | — | — |
| `/addresses` | NOINDEX, endereços privados | noindex,follow | — | — |
| `/me/update` | NOINDEX, perfil privado | noindex,follow | — | — |
| `/password/update` | NOINDEX, credenciais | noindex,follow | — | — |
| `/shipping` | NOINDEX, checkout privado | noindex,follow | — | — |
| `/orders` | NOINDEX, histórico privado | noindex,follow | — | — |
| `/order/:id` | NOINDEX, pedido privado | noindex,follow | — | — |
| `/dashboard` e abas | NOINDEX, administração privada | noindex,follow | — | — |
| `/password/forgot` | NOINDEX, autenticação | noindex,follow | — | — |
| `/password/reset/:token` | NOINDEX, token nunca vai para head | noindex,follow | — | — |
| `/login` | NOINDEX, autenticação | noindex,follow | — | — |
| `/cart` | NOINDEX, carrinho | noindex,follow | — | — |
| `*` | NOINDEX, página inexistente | noindex,follow | — | — |
| Fallback global de recuperação | NOINDEX, falha | noindex,follow | — | — |

Categoria e página continuam na URL e na consulta da API. Não são apagadas nem
canonicalizadas para a primeira página. Tracking/hash nunca entram em canonical;
busca/filtros não autorizam novas origens. O catálogo usa apenas keyword/category/page.

## Metadata architecture

Antes: React 19 promovia `<title>` de `MetaData`; Page acrescentava `| Fetech`.
Agora: `seo/metadata.mjs` centraliza política e dados; `seo/head.mjs` é o único
escritor do head. `MetaData` usa `useLayoutEffect`, rota atual e configuração de build.
Page transmite somente o produto público já carregado. Nenhum import adicional de
estado privado ou fetch SEO. Home usa o mesmo helper; Loader de página cobre
Suspense/loading. Recovery React e bootstrap usam a mesma autoridade, fora do Router.

Cada aplicação remove title/description/robots/canonical/OG/Twitter anteriores e o
script SEO identificado, e cria uma única instância por chave. Cleanup estabelece
baseline genérico noindex. Strict Mode faz replay sem acumular tags. Não usa innerHTML.
Foco, h1, skip link e ScrollToTop continuam sob o mecanismo F033.
Títulos privados são definidos pela rota, sem nomes, e-mails, endereços, IDs ou tokens.
Busca não copia o termo para description/OG. Login usa título genérico de autenticação.

## Canonical strategy e public origin

Nova configuração necessária porque não havia fonte frontend autorizada e
`FRONTEND_URL` pertence ao backend. `VITE_PUBLIC_SITE_URL` é opcional e pública,
embutida no build pelo Vite. Não usa `window.location.origin`, Host, query ou storage.
Valida origem HTTPS sem credenciais, caminho, query, fragmento ou porta; entradas
locais evidentes são rejeitadas. Valor inválido informado faz Vite falhar sem imprimi-lo.
Ausência permite build local e omite canonical. Validação sintática **não** aprova
domínio, staging ou ownership; a aprovação formal pertence a F023.

Fixture exclusivamente sintética: `https://catalog.example.com`; nunca apresentada
como URL real da Fetech. O ambiente real não foi alterado. Sem origem configurada,
não há canonical de produção; `BLOCKED_BY_F023` permanece.

## Product SEO, Open Graph e JSON-LD

Título/nome vêm do produto correspondente ao ID da rota. Description remove tags,
controles e whitespace repetido, limitada a 160 code points Unicode; nome a 120.
Texto vazio usa descrição pública genérica. Não há reviews individuais ou dados do autor.
OG usa título/description/type reais; `product` no produto e `website` nas páginas
públicas. `og:url` depende de canonical. Twitter usa summary/summary_large_image
sem conta fictícia. Imagem é a primeira imagem real: HTTPS absoluta ou relativa à
origem autorizada; rejeita credenciais, protocol-relative, data, query e fragmento.
Sem imagem pública absoluta segura não publica `og:image` nem imagem inventada.

Product schema usa `https://schema.org`. Offer somente com `priceCents` inteiro seguro
não negativo e `Stock` inteiro não negativo. Conversão por BigInt dá string decimal
exata de duas casas, BRL. Stock > 0 = InStock, zero = OutOfStock. URL só com origem.
AggregateRating somente para `numOfReviews` inteiro positivo e `ratings` finito entre
1 e 5; sem nota padrão. Não cria brand, SKU, GTIN, MPN, seller, pagamento, frete,
devolução, Organization ou LocalBusiness. Dados comerciais F014/F015 são preservados.
Serialização escapa `<`, `>`, `&`, U+2028/U+2029; inserção usa `textContent`.
ID trocado/erro/loading não mantém schema do produto anterior.

Referências oficiais: [Google — SEO JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Schema.org Product](https://schema.org/Product), [Offer](https://schema.org/Offer).
Metadata em JavaScript pode ser processada por renderização de crawlers, mas isso
não comprova renderização por todos os buscadores ou compartilhadores.

## robots e sitemap

robots.txt permanece `User-agent: *` e `Disallow:` vazio, permitindo crawlers lerem
noindex. Não é autorização nem proteção de dados; autenticação/autorização F006/F016
e Cache-Control privado continuam responsáveis por essas garantias.
Não há sitemap publicado nem URL Sitemap inventada no robots. Sem domínio, destino
de publicação e fonte integral confiável do catálogo, um gerador não usado criaria
falsa garantia. **SITEMAP DE PRODUÇÃO BLOQUEADO POR F023**. Nenhuma consulta Mongo/API
acontece no build ou auditoria offline. Sem lastmod, priority ou dados fabricados.

## Limitações de SPA

**Product metadata no HTML inicial: NÃO. Client JS required: SIM.**
Build e GET profundo sem executar React contêm um title genérico, description
`Loja Fetech de hardware e tecnologia`, canonical ausente e OG ausente. Não há
noindex estático global: isso poderia impedir renderização de páginas públicas.
Metadata específica aparece após JavaScript/dados. Social preview plenamente
garantido: **NÃO**; crawlers sociais podem não executar JS. Sem SSR/prerender.

404 client-side tem título coerente e noindex. Host de teste devolve HTTP 200 na
SPA; API devolve 404 nas suas próprias rotas. HTTP 404 real por URL frontend em
produção não foi comprovado e depende do hosting. Não alegar que UI 404 corrige HTTP.

## Dependências de F023

| Componente | Estado | Próxima evidência necessária |
|---|---|---|
| Domínio canônico de produção | BLOCKED_BY_F023 | origem formal, DNS/TLS, build promovido |
| Sitemap de produção | BLOCKED_BY_F023 / BLOCKED_BY_DEPLOYMENT | domínio, entrega pelo host, catálogo integral e refresh |
| Metadata específica no HTML inicial | BLOCKED_BY_F023 | decisão SSR/prerender/hosting e probe sem JS |
| HTTP 404 frontend | BLOCKED_BY_F023 | política do host e GET de URL inválida |
| Entrega/comportamento robots | BLOCKED_BY_F023 | GET público do arquivo e headers/cache no destino |

## O que NÃO foi implementado

SSR, prerender, framework novo, sitemap fictício, analytics, busca indexável arbitrária,
Organization/identidade não comprovada, domínio real presumido, políticas comerciais,
pagamento F001, frete F027, operações no banco e índices, envio SMTP/Cloudinary reais.
SEO técnico não garante ranking. Core Web Vitals de produção não foram medidos.

## Testes e operação

`node --test ecommerce/tests/frontendSeo.test.js ecommerce/tests/frontendSeoArchitecture.test.js`;
`npm.cmd run test:e2e --prefix ecommerce -- seo.spec.js`;
`npm.cmd run audit:seo --prefix ecommerce/frontend` após build.
Auditoria READ_ONLY_OFFLINE lê build/configuração de código, sem banco, rede ou secrets.
Architecture/tests e auditoria integram Commercial Gate; E2E sem skips SEO.
Evidências e resultados: [TESTES_FET_SEO_001.md](TESTES_FET_SEO_001.md).

Checklist operacional F023: aprovar origem pública; configurar e promover o mesmo
artefato; medir HTML inicial sem JS e renderização profunda; decidir SSR/prerender;
validar robots/status/cache/CSP no host; definir sitemap com catálogo integral;
validar páginas removidas; ensaiar crawlers sociais. Não iniciar F023 automaticamente.
