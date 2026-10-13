# Relatório — FET-A11Y-001 / F033

## Resultado e identificação

**CONCLUÍDO**.

Branch: **main**. HEAD inicial e final: `85f54ce1481574187bf592d0053126a13d83bcf3`.
Worktree inicial limpo; F040 commitada nesse HEAD. Nenhuma alteração anterior
descartada. F033 permanece **sem commit**, sem push e sem co-author novo.
Finding: **F033**. Status: **CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO DE ACESSIBILIDADE**.

## Escopo normativo

[WCAG 2.2 AA / W3C](https://www.w3.org/TR/WCAG22/) como referência técnica.
Certificação alegada: **NÃO**. A automação não constitui avaliação completa de conformidade.
Inventário de páginas e componentes: [ACESSIBILIDADE.md](ACESSIBILIDADE.md).

## Audit pré-fix

Inventário factual em [A11Y_BASELINE_ANTES.json](A11Y_BASELINE_ANTES.json),
25 páginas/estados examinados antes dos ajustes.

| Página/estado | Finding | Severity |
|---|---|---|
| Pesquisa | landmark-unique: buscas sem nomes distintos | moderate |
| Editar perfil/avatar | aria-allowed-role: Button component=label | minor |
| Todas as páginas inventariadas | skip link ausente | verificação estrutural/teclado |
| Seis abas do dashboard | quatro h1, incluindo números | verificação estrutural |
| Login → forgot | foco termina no BODY após Enter | verificação de teclado |
| Salvar/excluir categoria, probe complementar | foco BODY quando trigger está pending/removido | verificação de foco |
| Boundary, cobertura ampliada antes de sua correção | main role=alert: aria-allowed-role/landmark-one-main | minor/moderate |
| Menu/tooltip aberto, cobertura ampliada | portal fora de landmark | moderate |

Não se atribuiu violation axe às verificações estruturais/teclado sem regra disparada.
No inventário inicial, as outras páginas tiveram zero violations axe; isso não
equivale a ausência de problemas de acessibilidade.

## Automated tool

Tool: **@axe-core/playwright 4.13.0**, nova devDependency frontend, com axe-core
transitivo e Playwright já instalado. Nenhuma dependência runtime de acessibilidade.
Suppressions: **NENHUMA**; sem disableRules, exclude, allowlist ou tags que limitem
as regras. Exigência: zero violações critical/serious/moderate/minor nos estados testados.

## Axe: comparação e resultado final

| Página/estado | Before | After observado |
|---|---:|---:|
| Home | 0 | 0 |
| Catálogo | 0 | 0 |
| Pesquisa | 1 moderate | 0 |
| Produto | 0 | 0 |
| Carrinho vazio/preenchido | 0 | 0 |
| Checkout | 0 | 0 |
| Login/cadastro | 0 | 0 |
| Forgot/reset | 0 | 0 |
| Perfil | 0 | 0 |
| Editar perfil/avatar | 1 minor | 0 |
| Alterar senha | 0 | 0 |
| Endereços | 0 | 0 |
| Pedidos | 0 | 0 |
| Privacidade cliente | 0 | 0 |
| Admin Produtos/Categorias/Usuários/Pedidos/Auditoria/Privacidade | 0 em cada | 0 em cada |
| Drawer categoria | 0 | 0 |
| 404 | 0 | 0 |
| Boundary três variantes | cobertura ampliada: 2 | 0 |
| Detalhe de pedido/erros/loading/dialogs/menus/reflow/F005 | cobertura ampliada | 0 |

As contagens finais foram confirmadas nas suítes aprovadas. Zero violations em
**todas as quatro severidades**, nos estados e temas claro/escuro cobertos.

## Landmarks, skip link, headings, titles e foco

Header/nav nomeada, um main visível e footer; menus em navegações nomeadas,
tooltip dentro do header. O main do layout permanece durante o loading; Loader standalone ou embutido
usa div dentro dele, evitando main aninhado. Boundary mantém main e alerta dentro dele.

Skip link primeiro na aplicação, visível no foco e ativável por Enter para o main.
Cada página crítica tem h1; números/valores deixam de ser headings. MetaData
mantém título por rota e recuperação tem título próprio sem PII. Pathname novo
foca h1 após lazy render; filtros/paginação não roubam foco. Back ao fragmento
de salto pode focar o main pelo comportamento nativo.

## Keyboard navigation e probes

Login: Tab entre e-mail/senha/visibilidade/link/submit, Space alterna senha, Enter
entra. Cadastro: setas/Enter nos tabs e campos; forgot: Tab/Enter e sucesso uniforme.
Busca: Enter; card: Enter; produto: adicionar; carrinho: Space para quantidade e
remoção, com foco lógico no heading após remover. Checkout: submit por Enter,
primeiro inválido focado; fluxo comercial existente também termina em detalhe
auditado por axe. Privacidade: request/cancel e confirmação forte nos E2E existentes.
Admin: abas/setas, ações contextualizadas, trap, Escape e retorno ao trigger.
Avatar: Space abre seletor nativo; arquivo rejeitado tem mensagem associada.
Boundary: foco e recarga por Enter nas variantes render/Redux/bootstrap.

Pré-fix Tab login: logo → busca → buscar → tema → carrinho → entrar → departamentos
→ produtos → tab entrar → e-mail. Pós-fix: skip primeiro → main no Enter; navegação
login→forgot foca h1; abrir drawer foca o campo; Escape devolve ao trigger; checkout
inválido foca destinatário. Sequências exercitadas por automação real Playwright.
Teclado manual humano: **NÃO**. Não se confunde essa cobertura com validação humana.
Os seis fluxos e 56 controles reais estão em [A11Y_TECLADO_DEPOIS.json](A11Y_TECLADO_DEPOIS.json).
O probe complementar pré-correção de foco no CRUD está em
[A11Y_FOCO_CRUD_ANTES.json](A11Y_FOCO_CRUD_ANTES.json).

## Forms e checkout

Labels programáticos; required nativo, explicação do asterisco, autocomplete de
nome/e-mail/senhas/endereço, inputMode de CEP/telefone sem conversão numérica.
AccessibleTextField associa constraints nativas; entrega/endereço usam contrato
compartilhado e helperText/aria-invalid/aria-describedby. Checkout tem resumo
anunciado, foco no primeiro inválido e zero POST inválido. Auth errors inline,
com foco no alerta de login; mensagens de sucesso não urgente usam status.
F005 mantém bloqueio quando storage falha e revisão explícita quando corrompido;
os probes existentes agora também passam pelo axe.

## Dialogs, menus, tabs, tables e pagination

Focus trap e restore do MUI preservados; títulos/descrições associados. Cancelar
recebe foco nas confirmações destrutivas. Escape fecha quando permitido; pending
continua protegendo operações que já protegiam o fechamento. Menus aceitam teclado
e restituem foco; tabs têm painel associado e setas/Enter. Caption e scope=col nas
tabelas; região interna focável para rolagem. Ações nomeiam produto/categoria/endereço
ou ID, sem e-mail no nome dos novos controles. Paginação portuguesa com aria-current;
paginação manual anuncia posição, com wrap responsivo.
Após submit e remoção/desabilitação do trigger, a restauração usa cadastro ou h1
como destino lógico e preserva um foco já movido. Esse retorno é verificado no
CRUD de categoria, endereço e execução administrativa de privacidade. Erro da
API de anonimização é exibido e anunciado dentro do modal ainda aberto.

## Product, cart, privacy, avatar e Error Boundary

Alt de produto descritivo, avatar contextual, logo nomeado. Rating equivalente
“N de 5 estrelas”; nota usa select nativo. Preço anterior/atual e estoque textuais.
Cards não aninham botão em link. Quantidades/remoção são contextualizadas e contagem
tem status. Refresh de review mantém a tela válida para não desmontar controles.
Sem autoplay e botões do carrossel sem animação.

Privacidade mantém políticas e confirmação forte; dialog nomeado/foco no campo,
irreversibilidade textual e status além da cor. Avatar usa botão real, formatos,
5 MiB, status da seleção e erro associado; F018 preservado. Boundary tem landmark,
alerta sem substituir main, heading ou botão focado, recarga nativa por teclado.
Avisos F031 ficam após skip link; dispensá-los devolve foco ao main.

## Contrast, focus indicator, reflow e reduced motion

Marca preservada. Bordas light/dark: padrão MUI composto **1,74:1/2,12:1** →
cores explícitas **3,74:1/4,63:1**. Expressão padrão conferida no código MUI local.
Texto primário light 16,03:1; secundário light 4,64:1; botão primário light 7,75:1;
botão dark 6,39:1; foco light/dark 4,75:1/7,67:1. Pares no contrato.
Ratio computado das bordas/textos/botões é testado no navegador.

Outline 3px mantido também nos ButtonBase e aviso de armazenamento; links textuais
sublinhados. Controles principais ≥24px. Reflow: **320×720** e **640×450**, este como
equivalente a viewport 1280×900 em 200%; checkout, admin e páginas públicas sem
overflow global. Tabela larga permite scroll interno focável.
Zoom manual real 200%: **NÃO**; equivalente automatizado: **SIM**.
Reduced motion preservado, sem autoplay/novas animações.

## Screen reader manual validation

Executada: **NÃO**. Não houve NVDA, JAWS ou VoiceOver. Não se reivindica cobertura
manual de leitor de tela. Browser validado: Edge local pelo Playwright; matrizes
adicionais de navegador/assistive technology continuam necessárias.

## Arquivos e dependências

Criados: AccessibleTextField.jsx, frontendAccessibilityArchitecture.test.js,
restoreActionFocus.js, A11Y_TECLADO_DEPOIS.json, A11Y_FOCO_CRUD_ANTES.json,
e2e/accessibility.spec.js, helpers/accessibility.js, A11Y_BASELINE_ANTES.json,
ACESSIBILIDADE.md, TESTES_FET_A11Y_001.md e este relatório.
Alterados: layout/App/routes/theme, catálogo/produto/carrinho/checkout,
formularios de conta/endereço/avatar, dashboard/privacidade/auditoria,
recovery/bootstrap, runner do Commercial Gate e asserções E2E afetadas.
Documentos de estado/plano/gates/persistência/privacidade/rotas atualizados.
Dependência nova: @axe-core/playwright, dev somente; lockfile frontend atualizado.
Não há mudanças de backend, contratos monetários, frete/pagamento ou config.env.

## Validações finais

Execução final aprovada, incluindo a correção de foco após pending e exclusão.

| Gate | Comando | Resultado |
|---|---|---|
| Focused architecture | node --test ecommerce/tests/frontendAccessibilityArchitecture.test.js | 47/47 |
| Focused browser accessibility | npm.cmd run test:e2e --prefix ecommerce -- accessibility.spec.js | 15/15; zero skips e violations |
| Architecture completa | npm.cmd run ci:architecture --prefix ecommerce | 118/118 |
| API completa | npm.cmd test --prefix ecommerce | 1802 resultados: 1787 aprovados, 15 F024, zero falhas |
| Build | npm.cmd run build --prefix ecommerce/frontend | aprovado |
| E2E integral | npm.cmd run test:e2e --prefix ecommerce | 75/75; zero skips, retries ou falhas esperadas |
| Commercial Gate | npm.cmd run ci:commercial --prefix ecommerce | aprovado integralmente |
| Diff | git -c core.safecrlf=false diff --check | aprovado |
| Audit backend | npm.cmd audit --prefix ecommerce | zero vulnerabilidades |
| Audit frontend | npm.cmd audit --prefix ecommerce/frontend | zero vulnerabilidades |

F024 skips permitidos: somente **15** casos conhecidos de mongodump/mongorestore.
E2E skips permitidos: **0**. Nenhum skip F033 novo. Comandos e casos individuais
em [TESTES_FET_A11Y_001.md](TESTES_FET_A11Y_001.md).

## Recursos reais e findings preservados

Banco `fetech`: **NÃO ALTERADO**. SMTP real: **NÃO CHAMADO**. Cloudinary real:
**NÃO CHAMADO**. Índices comerciais: **NÃO APLICADOS**. Sem download Database Tools.
Auditoria histórica: **NÃO ALTERADA**; só documentação corrente acrescentada.
Alterações fora de escopo: **NENHUMA**. Nenhuma próxima task iniciada.

F024 **CONTINUA PARCIAL**, restore real bloqueado por Tools ausentes conforme escolha
anterior do usuário. F026 **CONTINUA PARCIAL**. F029 **CONTINUA ABERTO**.
F030 **CONTINUA CORRIGIDO NO CÓDIGO — BASELINE TÉCNICO**.
F039 **CONTINUA CORRIGIDO NO CÓDIGO / VALIDAÇÃO REMOTA PENDENTE**.
F040 **CONTINUA CORRIGIDO NO CÓDIGO**, SMTP real ainda não validado.
F001 pagamento e F027 frete: **NÃO INICIADOS**.

F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013, F014,
F015, F016, F017, F018, F019, F020, F021, F022, F025, F031, F036 e F037 mantêm
o estado corrente documentado de correção no código e seus limites anteriores.
F030/F039/F040 conforme acima; nenhuma expansão de alegação sobre integrações reais.

## Riscos residuais e próxima recomendação

Checks automáticos não garantem conformidade completa. Leitores de tela não foram
testados manualmente; combinações adicionais de navegador/tecnologia assistiva
podem revelar problemas. SEO e performance frontend avançada são independentes.
F024/F026 parciais, F029 aberto, F039 remoto pendente; pagamento/frete adiados.

Próxima recomendação: inventariar findings P2/P3 ainda abertos. A documentação
corrente não oferece uma classificação factual suficiente para escolher entre
SEO técnico/indexabilidade e Core Web Vitals; essa escolha depende do inventário.
Nenhuma delas foi iniciada automaticamente.



## Axe final por severidade

Observado nos testes focados e probes adicionais de checkout/privacidade/storage.
Temas claro/escuro nas páginas da matriz; não há suppression ou finding residual
moderate/minor admitido nos estados cobertos.

| Página/estado | Critical | Serious | Moderate | Minor |
|---|---:|---:|---:|---:|
| Home | 0 | 0 | 0 | 0 |
| Catálogo/busca/vazio/loading | 0 | 0 | 0 | 0 |
| Pesquisa | 0 | 0 | 0 | 0 |
| Produto | 0 | 0 | 0 | 0 |
| Carrinho vazio/preenchido | 0 | 0 | 0 | 0 |
| Checkout/erro/reflow/F005 | 0 | 0 | 0 | 0 |
| Login/cadastro/erro | 0 | 0 | 0 | 0 |
| Forgot/reset | 0 | 0 | 0 | 0 |
| Perfil/editar/avatar/erro/senha | 0 | 0 | 0 | 0 |
| Endereços/drawer | 0 | 0 | 0 | 0 |
| Pedidos/detalhe | 0 | 0 | 0 | 0 |
| Privacidade cliente | 0 | 0 | 0 | 0 |
| Admin Produtos | 0 | 0 | 0 | 0 |
| Admin Categorias | 0 | 0 | 0 | 0 |
| Admin Usuários | 0 | 0 | 0 | 0 |
| Admin Pedidos | 0 | 0 | 0 | 0 |
| Admin Auditoria | 0 | 0 | 0 | 0 |
| Admin Privacidade/dialog/erro API | 0 | 0 | 0 | 0 |
| Confirmação de exclusão/drawer categoria | 0 | 0 | 0 | 0 |
| Menus abertos | 0 | 0 | 0 | 0 |
| 404 | 0 | 0 | 0 | 0 |
| Boundary render/Redux/bootstrap | 0 | 0 | 0 | 0 |

Zero violations não significa certificação WCAG ou avaliação completa de AT.

## Inventário exato dos arquivos desta entrega

- docs/A11Y_BASELINE_ANTES.json
- docs/A11Y_FOCO_CRUD_ANTES.json
- docs/A11Y_TECLADO_DEPOIS.json
- docs/ACESSIBILIDADE.md
- docs/CI_E_GATES_COMERCIAIS.md
- docs/ESTADO_ATUAL_PROJETO_FETECH.md
- docs/PERSISTENCIA_FRONTEND.md
- docs/PLANO_MELHORIAS_FETECH.md
- docs/PRIVACIDADE_E_RETENCAO.md
- docs/RELATORIO_FET_A11Y_001.md
- docs/TESTES_FET_A11Y_001.md
- ecommerce/frontend/package.json
- ecommerce/frontend/package-lock.json
- ecommerce/frontend/src/App.css
- ecommerce/frontend/src/App.jsx
- ecommerce/frontend/src/component/Admin/AuditTrail.jsx
- ecommerce/frontend/src/component/Admin/CategoriesManager.jsx
- ecommerce/frontend/src/component/Admin/Dashboard.jsx
- ecommerce/frontend/src/component/Admin/PrivacyRequests.jsx
- ecommerce/frontend/src/component/Cart/Cart.jsx
- ecommerce/frontend/src/component/Cart/CartItemCard.jsx
- ecommerce/frontend/src/component/Cart/Shipping.jsx
- ecommerce/frontend/src/component/Home/Home.jsx
- ecommerce/frontend/src/component/Home/ProductCard.jsx
- ecommerce/frontend/src/component/layout/AccessibleTextField.jsx
- ecommerce/frontend/src/component/layout/DataTable.jsx
- ecommerce/frontend/src/component/layout/Header/Header.jsx
- ecommerce/frontend/src/component/layout/Header/UserOptions.jsx
- ecommerce/frontend/src/component/layout/Loader/Loader.jsx
- ecommerce/frontend/src/component/layout/Page.jsx
- ecommerce/frontend/src/component/layout/QuantityControl.jsx
- ecommerce/frontend/src/component/layout/ScrollToTop.jsx
- ecommerce/frontend/src/component/Order/OrderDetails.jsx
- ecommerce/frontend/src/component/Product/ProductCarousel.jsx
- ecommerce/frontend/src/component/Product/ProductDetails.jsx
- ecommerce/frontend/src/component/Product/Products.jsx
- ecommerce/frontend/src/component/Product/ReviewCard.jsx
- ecommerce/frontend/src/component/Product/Search.jsx
- ecommerce/frontend/src/component/recovery/AppErrorBoundary.jsx
- ecommerce/frontend/src/component/recovery/recovery.css
- ecommerce/frontend/src/component/recovery/StorageNotices.jsx
- ecommerce/frontend/src/component/User/Addresses.jsx
- ecommerce/frontend/src/component/User/AddressForm.jsx
- ecommerce/frontend/src/component/User/ForgotPassword.jsx
- ecommerce/frontend/src/component/User/FormLayout.jsx
- ecommerce/frontend/src/component/User/LoginSignUp.jsx
- ecommerce/frontend/src/component/User/ResetPassword.jsx
- ecommerce/frontend/src/component/User/UpdatePassword.jsx
- ecommerce/frontend/src/component/User/UpdateProfile.jsx
- ecommerce/frontend/src/index.jsx
- ecommerce/frontend/src/routes.jsx
- ecommerce/frontend/src/storage/bootstrapRecovery.mjs
- ecommerce/frontend/src/theme.js
- ecommerce/frontend/src/utils/restoreActionFocus.js
- ecommerce/scripts/ci/run.js
- ecommerce/tests/e2e/accessibility.spec.js
- ecommerce/tests/e2e/addresses.spec.js
- ecommerce/tests/e2e/frontendStorage.spec.js
- ecommerce/tests/e2e/money.spec.js
- ecommerce/tests/e2e/orderIdempotency.spec.js
- ecommerce/tests/e2e/orderStateMachine.spec.js
- ecommerce/tests/e2e/pagination.spec.js
- ecommerce/tests/e2e/privacy.spec.js
- ecommerce/tests/e2e/productCoherence.spec.js
- ecommerce/tests/e2e/reviews.spec.js
- ecommerce/tests/e2e/routes.spec.js
- ecommerce/tests/e2e/userLifecycle.spec.js
- ecommerce/tests/frontendAccessibilityArchitecture.test.js
- ecommerce/tests/helpers/accessibility.js
- ROTAS.md
