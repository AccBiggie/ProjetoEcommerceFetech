# Testes — FET-A11Y-001 / F033

Todos os testes usam o runner F039: MongoDB temporário em replica set, origem E2E
dinâmica e teardown validado. Nenhum teste usa o banco `fetech`, SMTP ou Cloudinary reais.
Edge já instalado, sem download de browsers. Não há skip ou suppression F033.

## Comandos reais

```powershell
node --test ecommerce/tests/frontendAccessibilityArchitecture.test.js
npm.cmd run ci:architecture --prefix ecommerce
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce -- accessibility.spec.js
npm.cmd run test:e2e --prefix ecommerce
$env:npm_config_cache = Join-Path (Get-Location) 'ecommerce/.npm-cache'
npm.cmd run ci:commercial --prefix ecommerce
git -c core.safecrlf=false diff --check
npm.cmd audit --prefix ecommerce --cache ecommerce/.npm-cache
npm.cmd audit --prefix ecommerce/frontend --cache ecommerce/.npm-cache
```

Para filtrar testes por expressão com `|` no Windows, usar diretamente Node,
evitando a interpretação do pipe pelo wrapper npm.cmd:

```powershell
node ecommerce/tests/runWithReplicaSet.js node_modules/@playwright/test/cli.js test accessibility.spec.js --grep 'loading|reflow;|Boundary'
```

## Casos individuais permanentes

`frontendAccessibilityArchitecture.test.js` gera um caso AST por arquivo JSX,
incluindo AccessibleTextField: não permite tabindex positivo literal, div/span
clicável nem IconButton sem nome. Dois casos adicionais cobrem política do axe/gate
e idioma/reduced motion. Parser reutilizado: Babel. Não se criou parser de JSX.

| Caso browser | Asserções relevantes |
|---|---|
| Público light | Home, catálogo, pesquisa, carrinho vazio, login, forgot, reset, 404, register; idioma, h1 único, hierarquia, IDs únicos, title; vazio e menu aberto sem violações |
| Cliente light | Perfil, endereços, perfil/avatar, senha, pedidos, privacidade; drawer trap/retorno; produto, carrinho preenchido, incremento por Space; checkout inválido, foco/association; erro de avatar |
| Admin light | Seis abas, painel associado, setas/Enter, drawer, trap, Escape, confirmação de exclusão e retorno |
| Público dark | Mesmo contrato público no dark |
| Cliente dark | Mesmo contrato cliente no dark |
| Admin dark | Mesmo contrato admin no dark |
| Skip link e rota | Primeiro Tab, link visível, Enter no main, navegação h1/title, Back ao fragmento; filtros não roubam foco; página atual marcada |
| Login/cadastro keyboard | Required nativo anunciado/associado, login por teclado, senha mostrar/ocultar, submit, erro inline, cadastro com tabs/setas e preenchimento |
| Forgot keyboard | Required/foco, preenchimento, Tab/Enter, resposta genérica para conta inexistente, sucesso em status e axe |
| Mobile/reflow/reduced motion | 320×720 e 640×450, Home/catálogo/login/404, overflow global, menu e Escape; CSS reduced motion |
| Error Boundary | Falhas render/Redux/bootstrap: landmark e alert corretos, axe, foco h1 ou recarregar, Enter/reload |
| Loading/search/card/cart/account menu | Skeletons antes de resposta, busca Enter, card Enter, adicionar, remover Space e foco lógico; menu autenticado axe/Escape |
| Checkout/admin reflow e contraste | Checkout 320/640 nos dois temas, submit visível, axe, ratios de borda/texto/botão; seis abas admin estreitas sem overflow global |
| Probes Tab de seis fluxos | Sequências reais em login/produto/cart/checkout/privacy/admin; nomes, nenhum foco oculto/tabindex positivo; attachment keyboard-sequences.json sem valores dos campos |
| Categoria: foco após submit | Criar e excluir por teclado; após pending e remoção do trigger, foco volta ao cadastro; registro removido |

Regressões existentes receberam apenas adaptações dos nomes contextualizados.
`routes.spec.js` também audita o detalhe de pedido após submit por Enter;
`privacy.spec.js` audita o dialog forte de anonimização e foco no campo;
também simula erro 503, exige alerta acessível dentro do dialog e foco lógico
após execução. `addresses.spec.js` exige retorno ao cadastro após excluir.
`frontendStorage.spec.js` audita tentativa corrompida e storage getter/getItem/setItem
indisponível com zero POST. F005, F009, F016, F018, F022, F030, F031, F037 e F040
continuam exercitados pelos seus testes integrais existentes.

## Probes e política

Pré-fix registrado em [A11Y_BASELINE_ANTES.json](A11Y_BASELINE_ANTES.json), 25 estados.
A execução inicial passou como inventário, sem exigir verde de accessibility.
Detectou landmark-unique na pesquisa (moderate), aria-allowed-role no avatar (minor),
ausência de skip link, quatro h1 no dashboard e foco BODY após mudança de rota.

Tab pré-fix em login: logo → busca → botão buscar → tema → carrinho → entrar
→ departamentos → produtos → tab entrar → campo e-mail. Enter em “Esqueci minha
senha” deixou o foco BODY. Depois: primeiro Tab é skip; Enter é main; a navegação
para forgot foca h1; o retorno ao fragmento foca main.
Os seis fluxos e 56 controles estão em [A11Y_TECLADO_DEPOIS.json](A11Y_TECLADO_DEPOIS.json),
exportados do attachment real do Playwright. Nenhum BODY ou valor de campo nesse registro.
Probe complementar revelou BODY depois de salvar/excluir categoria:
[A11Y_FOCO_CRUD_ANTES.json](A11Y_FOCO_CRUD_ANTES.json). A restauração posterior ao
pending/fechamento corrige o caso sem roubar um foco já movido.

Cobertura ampliada reproduziu o role alert indevido no main do boundary e conteúdo
de menus/tooltips em portais fora de landmarks. Foram corrigidos semanticamente,
sem esconder controles ou suprimir regras. Ao adicionar painéis aos tabs, um papel
inadequado em form foi detectado e corrigido usando um container de painel.

`expectNoA11yViolations` aguarda o término de transições CSS finitas (Grow/Fade),
auditando o estado aberto estável. Animações infinitas de loading/foco permanecem
presentes. Não desabilita movimento da aplicação nem regras para obter verde.
Exige vetor vazio, inclusive moderate/minor; faz analyze
com regras padrão e não imprime HTML/valores de inputs. Violations exibem somente
regra, impacto, ajuda e seletores sem valores de atributos. Falhas normais Playwright
usam artefatos locais de fixtures, nunca dados reais.

Limites: teclado Playwright não é teste humano. Não houve NVDA/JAWS/VoiceOver nem
zoom manual real; houve equivalente de reflow. Axe pode retornar verificações
incomplete que necessitam julgamento humano, mesmo sem violations. Não há
certificação WCAG ou alegação de conformidade completa.

Resultados finais e contagens: [RELATORIO_FET_A11Y_001.md](RELATORIO_FET_A11Y_001.md).
