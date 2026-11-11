# Relatório — FET-PERF-002 / F038

## Resultado e Git

**CONCLUÍDO**. **F038 — CORRIGIDO NO CÓDIGO** no escopo frontend.

Branch **main**. HEAD inicial/final sem commit:
`e6fcee5c460c7b13aafabf165595815e52f4c944`.
Worktree inicial **limpo**; F033 **já commitada** nesse HEAD, superando o
baseline informado no anexo. Nenhuma alteração anterior foi descartada.
FET-PERF-002 permanece **sem commit**, sem push, sem novo co-author.

## Finding factual

**F038**, confirmado: **SIM**. Categoria original Performance frontend.
Descrição original: **Imagem hero e chunks sem orçamento operacional**.
LOW/P2, CONFIRMADO no inventário histórico. Fonte factual disponível:
`.local/audit/create-report.cjs`, posição 38 em findingData e regra de atribuição
F + índice+1. O relatório histórico gerado não está no worktree; o gerador
original não foi executado nem alterado. Referências posteriores a custo de
queries/escala como F038 são preservadas como residual, sem renumeração/claim
de que essa otimização resolve busca em escala.

Inventário completo de rotas, imports anteriores/finais, chunks, componentes,
dados/fetches, imagens/fontes/CSS e grafo:
[PERFORMANCE_FRONTEND.md](PERFORMANCE_FRONTEND.md).

## Baseline pré-fix e problemas reproduzidos

Build pré-fix executado antes de ajustes funcionais, Vite 8.3.3/React 19.3.0,
sem updates. Override de build habilitou manifest e proveniência de módulos.
Raw/gzip/closures/origens reais:
[PERF_BUNDLE_ANTES.json](PERF_BUNDLE_ANTES.json).
Probe browser limpo local de Home em 360/1440px, seguido de dashboard:
[PERF_REDE_ANTES.json](PERF_REDE_ANTES.json).

Problemas reais: hero PNG 1.068.973 bytes; sem orçamento; Search importando
TextField amplo no shell; módulos AuditTrail/PrivacyRequests juntos com
Dashboard antes de abrir suas abas; dashboard consulta três listas ao mount
e callback refazia todas em mudanças de página/filtro. O teste de chunk atrasado
também reproduziu falta de h1 no fallback existente, corrigida sem suppression.

Já protegidos: router lazy para produtos/auth/cliente/dashboard, **Admin não
baixado pela Home** antes da task, cards lazy e container fixo, paginação F022,
search por submit, contextos, recovery F031, títulos/teclado/foco F033. Não se
fabricou uma migração eager→lazy dessas rotas ou duplicidade no mount normal.

## Implementação

Public: Home/shell eager preservados; Search usa OutlinedInput nomeado,
com semântica/submit/contorno mantidos e menos JS de formulário no initial.
Produto e catálogo lazy já existentes preservados. Customer: account, privacy,
addresses, orders, checkout e formulários continuam lazy. Admin: Dashboard
permanece lazy; AuditTrail/PrivacyRequests agora dynamic entries separados,
literal imports e Suspense local. CategoriesManager mantido no painel por seu
botão de cadastro compartilhado. Nenhum prefetch global/manualChunks novo.

Admin carregado na Home: **NÃO**, antes/depois. Admin obtido ao navegar:
**SIM**. Abas audit/privacy obtidas somente quando abertas: **SIM**.
Suspense página usa Loader status com área mínima/h1 transitório; não rouba
foco. ScrollToTop ignora título transitório e espera definitivo. Loader de
aba mantém parágrafo, pois o painel já tem h1. Falha de chunk continua
recuperável pelo ErrorBoundary F031. Nenhuma rota de falha em produção.

Requests redundantes identificadas: consultas de listas não ativas no
dashboard. Correção: uma coleção por aba/página/filtro, preservando AbortController
e identidade de resposta. Contagens carregam por aba com `—` inicial e explicação
na UI. Home e detalhe: um GET por mount nos probes. latestRead deduplica somente
pending idêntico, aborta chave anterior e protege sucesso/erro antigo, tanto
lista quanto detalhe. Não faz cache concluído e permite refetch/retry.
StrictMode não foi removido; já ausente do wrapper App de produção. Harness
real React dev executa efeito duas vezes com um GET lista/um GET detalhe.
Mutations comerciais não são deduplicadas por esse helper; F005 permanece
protegido por idempotência própria. F022 busca apenas página ativa, stale
response protegido; search somente submit, sem debounce novo.

## Imagens/fontes/renderização

Hero convertida **localmente** para WebP usando sharp já instalado, quality82/
effort6, 1920×360 preservados, eager e uma fetchPriority high. PNG fonte mantido,
sem import final. Candidate LCP confirmado em dois tamanhos pré-fix. Cards:
lazy/async/alt, container 200px mantido. Detalhe: primeira eager, demais lazy,
async, 250/350px contain. Avatar/logo/lifecycle F018/F019 mantidos. Nenhuma
Cloudinary transformation inventada: **NÃO**. Sem srcSet/sizes sem fontes reais.
Política lazy não promete zero requests offscreen; proximidade/cache/URLs
compartilhadas da fixture influenciam recursos observados.

Fontes: stack local, sem request remoto/font weights novos. CSS/foco/contraste/
reduced motion F033 preservados, sourcemaps continuam padrão desativado.
Memoizações/refactors de render: **nenhuma memoização nova**; nenhum profiling
indicou necessidade. Keys por ID e DOM da página ativa mantidos; agregados e
descontos vêm do backend. Nenhuma virtualization/biblioteca de cache nova.

## Bundle antes/depois

| Métrica | Antes | Depois | Diferença |
|---|---:|---:|---:|
| initial JS raw | 679316 | 648394 | -30922 |
| initial JS gzip | 220428 | 213472 | -6956 (-3,16%) |
| entry JS gzip | 93759 | 93792 | +33 |
| initial CSS raw | 1706 | 1706 | 0 |
| initial CSS gzip | 830 | 830 | 0 |
| largest lazy/route gzip | 11192 | 11260 | +68 |
| dashboard route gzip | 6690 | 5722 | -968 |
| initial chunk count | 9 | 11 | +2 |
| total JS chunks | 36 | 42 | +6 |
| hero raw | 1068973 | 88358 | -980615 (-91,73%) |

Bytes, gzip por zlib, arquivos e origem factual dos módulos:
[PERF_BUNDLE_DEPOIS.json](PERF_BUNDLE_DEPOIS.json). Não se deduz origem apenas
pelo nome do chunk. Bootstrap App dinâmico **incluído** no initial. O aviso
Vite de store dinamicamente/estaticamente importada é preexistente e mantido
para preservar o boot/recovery. Não representa uma rota admin no entry.

Audit: `npm.cmd run audit:bundle --prefix ecommerce/frontend`, somente leitura,
entry/initial/routes/raw/gzip/CSS/maiores assets manifest e public. Resultado:
**APROVADO**, sem source content. Gate:
`npm.cmd run ci:bundle-budget --prefix ecommerce/frontend`, **APROVADO** no
build otimizado. Config `ecommerce/frontend/bundle-budget.json`, gerada da
medição final e versionada, não recalculada pelo CI.

| Budget | Máximo |
|---|---:|
| initial JS gzip | 218809 |
| entry JS gzip | 98482 |
| initial JS raw | 680814 |
| initial CSS raw/gzip | 1792 / 872 |
| largest lazy/route gzip | 11823 |
| admin route gzip | 6009 |
| imagem importada no manifest raw | 100000 |
| initial / total JS chunks | 13 / 48 |

Margens: initial gzip +2,5% (baseline antigo continua acima); outros bytes
JS/CSS +5%; hero até 100k (+13,2%); contagens +2/+6. Pequena margem operacional
e evidência concreta; não há ceiling arbitrário copiado de outro projeto.
Guard de proveniência bloqueia Admin no initial, além de privacy/checkout.
17 dynamic entries obrigatórios. Budget menor em fixture reprova, incluindo
quatro métricas mínimas; falta de entry/proveniência/rota falha fechado.

## Probes de rede e Core Web Vitals lab

Evidência real extraída dos attachments Playwright de execução aprovada:
[PERF_REDE_DEPOIS.json](PERF_REDE_DEPOIS.json).

| Home | Antes 360 | Depois 360 | Antes 1440 | Depois 1440 |
|---|---:|---:|---:|---:|
| JS resources | 9 | 11 | 9 | 11 |
| chunks admin | 0 | 0 | 0 | 0 |
| GET catálogo | 1 | 1 | 1 | 1 |
| GET categorias | 1 | 1 | 1 | 1 |
| GET sessão | 1 | 1 | 1 | 1 |
| URLs de imagem observadas | 2 | 2 | 2 | 2 |
| última entrada LCP lab (ms) | 616 | 552 | 148 | 352 |
| CLS lab | não medido | 0,008261 | não medido | 0,001798 |

Sem promessa de melhora temporal: o desktop lab final foi mais lento nessa
amostra, apesar da grande redução de bytes da hero. INP/proxy: **NÃO MEDIDO**.
**lab measurement != field Core Web Vitals**; não representam field Core Web
Vitals de produção. Sem limiar temporal obrigatório ou score Lighthouse.
Fixtures reutilizam URL de imagem, e browser pode carregar lazy por proximidade;
duas URLs não significam que só dois cards existam ou que toda imagem offscreen
foi adiada. Cards abaixo da viewport tiveram lazy/async e espaço reservado.

Probe admin final inicia na Home admin autenticada, navega sem reload e abre
users/filtro/audit/privacy: 24 JS resources acumulados; requests admin:
products página1 **1**, users página1 **2** (aba/filtro), orders **0**, audit
página1 **1**, privacy página1 **1**. Dashboard antes tinha products/users/orders
no mount; depois só products. Admin module paths são resolvidos pelo manifest/
proveniência, não regex de filename hash. Login/Product/Orders têm probes
dedicados sem módulo admin; title/focus/back/forward/axe cobertos.

## Testes e validação final

Testes criados: oito de arquitetura/leituras, dezoito de parser/budget, nove
browser, quatro novos probes de thunks reais (mais dois preservados),
enumerados em [TESTES_FET_PERF_002.md](TESTES_FET_PERF_002.md).
Nenhum skip novo, supressão axe, retry ou fail esperado.

| Check/comando | Resultado |
|---|---|
| `node --test ecommerce/tests/frontendPerformanceArchitecture.test.js` | 8/8 no focused conjunto |
| `node --test ecommerce/tests/frontendBundleBudget.test.js` | 18/18 no focused conjunto |
| focused conjunto | 26/26; zero skips |
| `node --test ecommerce/tests/frontendPaginationStale.test.js` | 6/6; zero skips |
| focused performance + boundary recovery final | 13/13; zero skips; 30,3s |
| `npm.cmd run test:e2e --prefix ecommerce -- frontendPerformance.spec.js` | 9/9; zero skips; 32s |
| acessibilidade F033 focused anterior ao ajuste do fallback | 15/15; zero violações |
| paginação focused | 6/6; resposta antiga descartada |
| `npm.cmd test --prefix ecommerce` via Commercial Gate | 1832 registros: 1817 aprovados + somente 15 F024 |
| arquitetura completa via Commercial Gate | 144/144; zero skips |
| `npm.cmd run build --prefix ecommerce/frontend` | APROVADO |
| budget real sobre build final | APROVADO |
| `npm.cmd run test:e2e --prefix ecommerce` via Commercial Gate | 84/84; zero skips/retries/falhas esperadas |
| F033 axe final e Order/F005/F031 | APROVADOS no E2E integral; zero violations axe |
| `npm.cmd run ci:commercial --prefix ecommerce` | APROVADO integralmente |
| `git diff --check` | APROVADO |
| npm audit backend/frontend | 0 vulnerabilidades em ambos |

O focused combinado de 30 casos teve 29 aprovados e falhou na nova inspeção
de fallback, que mostrou a lacuna real de h1; após correção, focused performance
9/9. Uma expectativa de título do novo teste foi alinhada ao título real
preexistente “Bem-vindo de volta”. Esses ensaios não são usados como gate verde.
A entrega requer Commercial Gate integral final, sem skips E2E.
O primeiro gate integral também expôs que o harness antigo do catálogo remove
imports e não injetava latestRead; adaptado para importar helper real e iniciar
o transporte antes da troca. As asserções de stale success/error foram mantidas
e ampliadas para detalhe/replay/refetch. Os seis probes passaram; gate refeito
integralmente, sem marcar a tentativa anterior como aprovação.
Uma execução integral seguinte apresentou cinco falhas UL-10 a UL-15 na suíte
preexistente de lifecycle de usuários. O diagnóstico isolado teve **76/76**,
sem reprodução; nenhum backend/lifecycle foi alterado. Nova execução integral
foi iniciada, sem retry automático/skip. Reporter agora fornece somente valores
numéricos actual/expected em asserções falhas, sem corpo/mensagem/stack. Probe
isolado confirmou redaction de sentinel privado e manutenção do gate reprovado.
Essa ocorrência não é atribuída ao frontend sem evidência de causa.
Outra tentativa integral registrou falhas UL-22/23/24/25. O diagnóstico completo
com o **mesmo paralelismo 4**, reporter spec e código inalterado, passou com
**1832 registros / 1817 aprovados / 15 F024**, zero falhas (132,4s). A causa da
intermitência não foi estabelecida; permanece registrada para investigação
separada, sem alegar que os budgets corrigem estabilidade do lifecycle. Não
foram alterados backend, timeouts, paralelismo, asserções ou políticas de skip.
Commercial Gate final precisa passar integralmente; resultados anteriores
falhos não são apresentados como aprovação.
O gate seguinte passou API/build/budget e 83/84 E2E; o novo harness tinha import
estático da store, normalizando storage legado também no cenário de recovery.
Corrigido: StrictRead fica em módulo dinâmico só do seu cenário, sem import de
store no entry do boundary. O focused final **13/13** comprova performance,
replay StrictMode e os quatro probes de boundary, incluindo preservação exata
de cart/draft/attempt/auth. Nenhum comportamento de storage produtivo alterado.
Após esse ajuste, a execução integral final passou: arquitetura 144/144,
API 1817 aprovados/15 F024, E2E 84/84 sem skips, build/budget e ambos os audits
aprovados. O Commercial Gate encerrou com exit code 0; nenhum check desta task
permanece pendente.

F024: apenas os quinze mongodump/mongorestore conhecidos são autorizados.
Probe budget failure: **APROVADO**, fixture menor reprova. Probe splitting:
**APROVADO**. Offscreen images: **APROVADO** (policy, não promessa de rede).
Duplicate read/StrictMode: **APROVADO**. Chunk recovery: **APROVADO**.

## Arquivos e dependências

Inventário exato: 40 arquivos (16 novos, 24 modificados).

### Arquivos criados

- `docs/PERFORMANCE_FRONTEND.md`
- `docs/PERF_BUNDLE_ANTES.json`
- `docs/PERF_BUNDLE_DEPOIS.json`
- `docs/PERF_REDE_ANTES.json`
- `docs/PERF_REDE_DEPOIS.json`
- `docs/RELATORIO_FET_PERF_002.md`
- `docs/TESTES_FET_PERF_002.md`
- `ecommerce/frontend/bundle-budget.json`
- `ecommerce/frontend/scripts/bundle-audit.mjs`
- `ecommerce/frontend/scripts/bundle-provenance.mjs`
- `ecommerce/frontend/src/images/wallpaperLoja2.webp`
- `ecommerce/frontend/src/utils/latestRead.mjs`
- `ecommerce/tests/e2e/frontendPerformance.spec.js`
- `ecommerce/tests/frontendBundleBudget.test.js`
- `ecommerce/tests/frontendPerformanceArchitecture.test.js`
- `ecommerce/tests/helpers/storageHarness/StrictRead.jsx`

### Arquivos alterados

- `docs/ACESSIBILIDADE.md`
- `docs/CI_E_GATES_COMERCIAIS.md`
- `docs/ESTADO_ATUAL_PROJETO_FETECH.md`
- `docs/PAGINACAO_E_PERFORMANCE_API.md`
- `docs/PERSISTENCIA_FRONTEND.md`
- `docs/PLANO_MELHORIAS_FETECH.md`
- `ecommerce/frontend/package.json`
- `ecommerce/frontend/src/actions/productAction.js`
- `ecommerce/frontend/src/component/Admin/Dashboard.jsx`
- `ecommerce/frontend/src/component/Home/Home.jsx`
- `ecommerce/frontend/src/component/Home/ProductCard.jsx`
- `ecommerce/frontend/src/component/Product/ProductDetails.jsx`
- `ecommerce/frontend/src/component/Product/Search.jsx`
- `ecommerce/frontend/src/component/Route/ProtectedRoute.jsx`
- `ecommerce/frontend/src/component/User/Profile.jsx`
- `ecommerce/frontend/src/component/layout/Loader/Loader.jsx`
- `ecommerce/frontend/src/component/layout/ScrollToTop.jsx`
- `ecommerce/frontend/src/routes.jsx`
- `ecommerce/frontend/vite.config.mjs`
- `ecommerce/scripts/ci/apiReporter.js`
- `ecommerce/scripts/ci/run.js`
- `ecommerce/tests/frontendPaginationStale.test.js`
- `ecommerce/tests/helpers/buildStorageHarness.mjs`
- `ecommerce/tests/helpers/storageHarness/main.jsx`
Dependências adicionadas:
**NENHUMA**, versões e lockfiles preservados. Sharp/backend já instalado usado
somente para gerar asset local. Nenhuma atualização React/Vite/MUI.

## Estado preservado

| Finding | Estado preservado |
|---|---|
| F002/F003/F004/F005 | corrigidos no código; estados/estoque/idempotência intactos |
| F006/F007/F008/F009/F010 | corrigidos no código; sessões/cookies/limites/recuperação/admin |
| F011/F012/F013/F014/F015/F016/F017 | corrigidos no código; histórico/snapshot/validação/dinheiro/reviews/lifecycles/hierarquia |
| F018/F019 | corrigidos no código; validação/lifecycle de mídia; provider real F029 pendente |
| F020/F021/F025/F036/F037 | corrigidos no código; hardening/observabilidade/env/catalog; ledger F037 deployment pendente |
| F022 | corrigido no código; índices comerciais pendentes, custo de escala residual não fechado |
| F030 | corrigido no código — baseline técnico de privacidade |
| F031 | corrigido no código — recovery/storage preservados |
| F033 | corrigido no código — baseline técnico de acessibilidade |
| F039 | corrigido no código / validação remota pendente |
| F040 | corrigido no código; SMTP real NÃO VALIDADO |
| F024 / F026 | CONTINUAM PARCIAIS |
| F029 | CONTINUA ABERTO |
| F001 / F027 | ADIADOS, NÃO INICIADOS |

Banco real **NÃO ALTERADO**. SMTP real **NÃO CHAMADO**. Cloudinary real **NÃO
CHAMADO**. Índices comerciais **NÃO APLICADOS** (F022/F037 pendentes).
config.env **NÃO ALTERADO**. Auditoria histórica **NÃO ALTERADA**.
Testes somente no harness isolado F039. Sem MongoDB Database Tools baixadas.

## Riscos residuais e próxima recomendação

Lab não representa usuários reais. CDN/cache/compression/deployment dependem
de F023. Novas features podem aumentar bundles, protegidos por budgets;
mudanças justificadas exigem revisão. Transformation/resoluções avançadas de
imagem dependem da arquitetura/provider real. SEO continua independente,
F024/F026 parciais, F029 aberto, F039 remoto pendente, payment/freight adiados.
O baseline não certifica CWV real ou produção comercial. Referências a tuning
de escala em F038 não foram implementadas nesta task frontend.
As falhas intermitentes observadas no lifecycle UL em duas rodadas merecem
investigação separada: causa não estabelecida, sem alteração de backend ou
relaxamento de testes; diagnóstico completo e gate final passaram com o mesmo
paralelismo. Não se promete ausência de futuras intermitências por este resultado.

Status F038: **CORRIGIDO NO CÓDIGO**, escopo frontend e orçamento; sem promessa de CWV/hosting produtivos.
Próxima recomendação, somente após conclusão: inventário para SEO técnico
(metadata, canonical, robots/indexability, structured data), verificando URL
pública/canonical, deployment e rotas indexáveis; se dependente de F023,
registrar bloqueio e selecionar outro P2/P3 independente. **NÃO INICIADA**.
