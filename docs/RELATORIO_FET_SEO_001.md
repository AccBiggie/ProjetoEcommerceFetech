# Relatório FET-SEO-001 — F032

Resultado: **PARCIAL / BLOQUEADO** nos componentes de produção.
Status do finding: **PARCIAL — PRODUÇÃO/INDEXABILIDADE DEPENDE DE F023**.
Baseline client-side seguro implementado; nenhum domínio ou deployment inventado.

## Branch, HEAD e worktree

- Branch: `main`.
- HEAD inicial: `af6c182453069dd76131ae8c54bd1cbe67df609e`.
- HEAD final: mesmo commit; esta task permanece **sem commit**.
- Worktree inicial limpo; F038 já estava commitada em HEAD.
- Alterações anteriores preservadas; sem reset/clean/push. Configuração real não alterada.

## Finding factual e inventários

**F032 — Metadados específicos e compartilhamento incompletos**, confirmado no
gerador histórico `.local/audit/create-report.cjs`, posição 32 de `findingData`.
Descrição original: “Title dinâmico e description genérica; sem canonical/sitemap/OG/Twitter/Product schema; manifest ainda CRA.”
O gerador histórico permanece intacto; os relatórios originais não estão no worktree.

Inventário completo e matriz de todas as rotas: [SEO_TECNICO.md](SEO_TECNICO.md).
Frontend/backend hosting produtivos: **não comprovados**. Express da aplicação
serve frontend: **NÃO**. Public canonical origin formal: **NÃO**. Fontes:
`backend/app.js`, `frontend/vite.config.mjs`, consumidores de configuração e árvore Git.
O Express do E2E é exclusivamente um host isolado com fallback HTTP 200.

## Metadata architecture e comportamento

`seo/metadata.mjs` decide política e dados. `seo/head.mjs` concentra toda escrita
DOM; MetaData integra React/Router, Page transmite produto público e Loader cobre
Suspense. Recovery React/bootstrap compartilham o mesmo escritor sem depender do
Router/store. Sem fetch SEO, dependências novas, Helmet, SSR ou prerender.
Title/description/robots/canonical/OG/Twitter e JSON-LD são substituídos integralmente;
Strict Mode não duplica tags e navegação remove dados anteriores.
H1/foco/F033 e lazy/budget F038 preservados.

Home e catálogo simples são INDEX. Produto real correspondente ao ID é INDEX após
carregamento; ausente/erro/loading é NOINDEX. Conta/admin/carrinho/checkout/reset/
pedidos/busca/404 são NOINDEX. Categoria/paginação permanecem noindex até política
comercial, sem apagar queries ou canonicalizar variantes para a primeira página.
Titles privados são fixos por rota; tokens/IDs/dados pessoais não entram no head.
Autenticação e autorização continuam responsáveis pela proteção, não robots.

## Canonical, produto e compartilhamento

Origem canônica apenas de `VITE_PUBLIC_SITE_URL`, opcional e validada no build e
no helper. Ausência mantém build local viável e omite URLs. Não usa origem do
navegador, query, API ou `FRONTEND_URL` privado do backend. HTTPS sem credenciais,
caminho, porta, query e fragmento. Hardcoded production domain: **NÃO**.
Fixture de teste com `.example.com` não representa domínio aprovado.

Produto: nome real, descrição sanitizada/limitada por code point; OG title,
description e type product; imagem real segura e URL apenas quando possível.
Twitter summary sem conta fictícia. Product JSON-LD usa `priceCents` inteiro seguro
F014 → decimal exato por BigInt, BRL; Stock real → InStock/OutOfStock; agregado
F015 somente com quantidade positiva e nota válida. Sem review individual, marca,
SKU, GTIN, seller, dados de frete, pagamento ou políticas inventadas.
JSON-LD escapa caracteres de breakout e usa textContent, sem innerHTML.

## HTML inicial e limitações de SPA

- Title: `Loja Fetech | Entre já para o mundo gamer`.
- Description: `Loja Fetech de hardware e tecnologia`.
- Canonical: **ausente**.
- OG: **ausente**.
- Metadata específica de produto no HTML inicial: **NÃO**.
- JavaScript requerido para metadata por rota: **SIM**.
- Social preview plenamente garantido: **NÃO**.

Probes em build e GET profundo sem executar React confirmam metadata genérica.
Com JavaScript, produto apresenta title/description/robots/OG/JSON-LD reais.
Não há noindex global estático. Crawlers sociais podem não executar JS.
UI 404 = noindex/título coerente. HTTP 404 real no hosting: **não comprovado**;
host E2E retorna 200 para fallback SPA. API mantém seus próprios HTTP 404.

## robots.txt e sitemap

robots permite crawl e leitura de noindex; arquivo copiado para build. Não é
controle de segurança e não comprova entrega no hosting produtivo.
Sitemap implementado: **NÃO**. Motivo: sem origem pública formal, destino de
entrega ou fonte integral de catálogo produtivo autorizados.
**SITEMAP DE PRODUÇÃO BLOQUEADO POR F023**; estado do auditor:
`BLOCKED_BY_DEPLOYMENT` e `BLOCKED_BY_F023`.
Não gera arquivo com fixtures, não consulta Mongo/API no build/CI.

## Arquivos criados

- `ecommerce/frontend/src/seo/metadata.mjs`, `head.mjs`.
- `ecommerce/frontend/scripts/seo-audit.mjs`.
- `ecommerce/tests/frontendSeo.test.js`, `frontendSeoArchitecture.test.js`.
- `ecommerce/tests/e2e/seo.spec.js`.
- `ecommerce/tests/helpers/storageHarness/StrictSeo.jsx`.
- `docs/SEO_TECNICO.md`, `RELATORIO_FET_SEO_001.md`, `TESTES_FET_SEO_001.md`.

## Arquivos modificados

- Frontend: `package.json`, `vite.config.mjs`, `public/manifest.json`.
- Layout: `MetaData.jsx`, `Page.jsx`, `Loader/Loader.jsx`.
- Produto: `Product/ProductDetails.jsx`.
- Recovery: `recovery/AppErrorBoundary.jsx`, `storage/bootstrapRecovery.mjs`.
- CI: `ecommerce/scripts/ci/run.js`.
- Testes/harness: `frontendStorageArchitecture.test.js`,
  `helpers/buildStorageHarness.mjs`, `helpers/storageHarness/main.jsx`.
- Docs: `ACESSIBILIDADE.md`, `PERFORMANCE_FRONTEND.md`, `CONFIGURACAO.md`,
  `CI_E_GATES_COMERCIAIS.md`, `ESTADO_ATUAL_PROJETO_FETECH.md`, `PLANO_MELHORIAS_FETECH.md`.

Manifest identifica Fetech; ícones existentes não foram substituídos por imagens
inventadas. Não há dependência nova ou mudança de lockfiles/budgets.

## Validação

**Commercial Gate APROVADO** na execução final: arquitetura 154/154; API
1.827 aprovados + 15 skips F024; E2E 90/90 sem skips/retries; axe zero violações;
build, audit:seo, bundle budget e diff aprovados; npm audits zero vulnerabilidades
nos dois pacotes. Testes focados SEO 10/10 e navegador SEO 6/6.

Comandos, contagens, probes e limitações da evidência em
[TESTES_FET_SEO_001.md](TESTES_FET_SEO_001.md). Commercial Gate inclui arquitetura,
API, build, audit SEO, bundle budget, E2E e npm audits. Não há skip SEO; somente
os 15 skips F024 existentes para mongodump/mongorestore permanecem permitidos.

## Segurança operacional e estados preservados

**Banco real NÃO ALTERADO. SMTP real NÃO CHAMADO. Cloudinary real NÃO CHAMADO.
Índices comerciais NÃO APLICADOS. Auditoria histórica NÃO ALTERADA.**
Testes usam runner F039, replica set temporário, portas dinâmicas e provedores
falsos locais. Sem Database Tools baixadas, sem audit fix, sem config.env real.

- F023: cinco componentes bloqueados individualmente no contrato SEO.
- F024: **CONTINUA PARCIAL**; Tools/restore reais pendentes.
- F026: **CONTINUA PARCIAL**; destino/CD não comprovados.
- F029: **CONTINUA ABERTO**; fornecedores reais não validados.
- F030: **CONTINUA BASELINE TÉCNICO**.
- F033: **CONTINUA BASELINE TÉCNICO DE ACESSIBILIDADE**.
- F038: **CONTINUA CORRIGIDO NO CÓDIGO**.
- F039: **CONTINUA CORRIGIDO NO CÓDIGO / VALIDAÇÃO REMOTA PENDENTE**.
- F040: **CONTINUA CORRIGIDO NO CÓDIGO**; SMTP real não validado.
- F001 pagamento e F027 frete: **ADIADOS / NÃO INICIADOS**.
- Índices F022/F037 pendentes; demais correções anteriores preservadas.

## Riscos residuais e próxima task recomendada

SPA depende de JavaScript e crawlers sociais podem não renderizar. Canonical de
produção, sitemap, HTML específico inicial, HTTP 404 e entrega robots dependem de
F023. SEO técnico não garante ranking; Core Web Vitals de produção não foram
medidos em campo. F024/F026/F029/F039 seguem com pendências e pagamento/frete adiados.

Próximo candidato independente: inventariar **F028 — cancelamento/devolução/reembolso**,
separando cancelamento/liberação de estoque do reembolso financeiro dependente
de F001. Não iniciar automaticamente F028, F023 ou outra task.
