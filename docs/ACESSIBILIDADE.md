# Acessibilidade — FET-A11Y-001 / F033

FET-ORDER-005: CancelOrder compartilhado entre lista/detalhe/admin usa botão com
nome contextual, Dialog com title/description, foco inicial em Voltar, trap,
Escape/retorno de foco, guard contra duplo clique, Cancelando… em role=status e
erro em Alert. Cancelado é texto, com data real no detalhe. Estado final sem ação
pode restaurar foco ao h1. E2E cobre teclado, diálogo, erro e axe sem supressões.
[Contrato](CANCELAMENTO_PEDIDOS.md).

FET-SEO-001: títulos/head passam pela autoridade `seo/head.mjs`, inclusive recovery.
Títulos privados são genéricos por rota, sem PII; catálogo filtrado usa título de catálogo.
H1, foco, skip link e lazy/Suspense permanecem sob F033. Teste SEO cobre navegação,
loading e Strict Mode; axe continua sem supressões. [Contrato SEO](SEO_TECNICO.md).

Referência: [WCAG 2.2 nível AA, W3C](https://www.w3.org/TR/WCAG22/).
Esta entrega estabelece um baseline técnico. Não representa certificação WCAG,
conformidade integral, nem cobertura de todas as combinações de tecnologia assistiva.

## Inventário factual

| Página ou estado real | Axe | Teclado | Foco | Formulários | Status |
|---|---|---|---|---|---|
| Home `/` | claro/escuro | salto, links, busca, cards | main/h1 | busca nomeada | baseline |
| Catálogo `/products`, keyword e categoria | claro/escuro, vazio, loading | filtro, busca, paginação | filtros preservam foco | select rotulado | baseline |
| Pesquisa `/search` | claro/escuro | busca e Enter | h1 | landmarks de busca distintos | baseline |
| Produto `/product/:id` | claro/escuro | link, quantidade, adicionar, avaliação | h1 | nota/comentário rotulados | baseline |
| Carrinho vazio/preenchido | claro/escuro | quantidade/remover/checkout | h1 | quantidade contextual | baseline |
| Checkout `/shipping` | claro/escuro, erro, reflow, F005 | submit por Enter | primeiro inválido | required, autocomplete, erros associados | baseline |
| Login e cadastro `/login` | claro/escuro, erro | tabs, inputs, senha, submit | h1/controle ativo | labels e senha apropriada | baseline |
| Recuperação `/password/forgot` | claro/escuro | inputs/botão | h1 | resposta uniforme F009 preservada | baseline |
| Redefinição `/password/reset/:token` | claro/escuro | inputs/botão | h1 | novas senhas | baseline |
| Perfil `/account` | claro/escuro | links/menu | h1 | não aplicável | baseline |
| Editar perfil/avatar `/me/update` | claro/escuro, erro | upload nativo por Space | botão de foto | formatos/limite/erro descritos | baseline |
| Alterar senha `/password/update` | claro/escuro | inputs/botão | h1 | current/new-password | baseline |
| Endereços `/addresses` e drawer | claro/escuro | abrir, Tab, Escape | trap/retorno | labels/erros/CEP string | baseline |
| Pedidos `/orders` | claro/escuro | links/paginação | h1 | não aplicável | baseline |
| Detalhe `/order/:id` | após checkout | submit de checkout | h1 | snapshot preservado | baseline |
| Privacidade `/account/privacy` | claro/escuro | request/cancel em E2E existente | h1 | status textual | baseline |
| Dashboard Produtos | claro/escuro, estreito | tab, ações, confirmação | trap/retorno | produto/categoria | baseline |
| Dashboard Categorias | claro/escuro, estreito | tab, drawer/fechar | trap/retorno | pai descrito | baseline |
| Dashboard Usuários | claro/escuro, estreito | tab, select e ações | tab | perfil rotulado por ID | baseline |
| Dashboard Pedidos | claro/escuro, estreito | tab, ações | tab | pagamento preservado | baseline |
| Dashboard Auditoria | claro/escuro, estreito | busca/paginação | tab | Request ID rotulado | baseline |
| Dashboard Privacidade | claro/escuro, estreito, confirmação | confirmação forte | foco dentro do dialog | confirmação rotulada | baseline |
| 404 | claro/escuro | links para início/catálogo | h1 | não aplicável | baseline |
| Error Boundary/render, Redux, bootstrap | três estados | recarga por Enter | h1 ou botão no bootstrap | não aplicável | baseline |
| Recuperação de armazenamento F031/F005 | corrupto/indisponível | revisão explícita | main após dispensar | POST bloqueado | baseline |

`/sad` somente redireciona para Home; `/products/:keyword` reutiliza o catálogo.
Suspense e carregamento de produto usam o Loader existente. Não há página separada
de pagamento ou integração de frete nesta entrega.

Componentes inventariados: Button, IconButton, Link/MuiLink, TextField/password/file,
Select nativo e MUI, Checkbox, Radio/RadioGroup, Menu/MenuItem, Dialog,
Drawer, Tabs/Tab/painel, Pagination, DataTable/Table/headers, Tooltip, Alert,
toast/status, CardActionArea, Skeleton, CircularProgress/LinearProgress e carrossel Embla.
Não foi encontrado Accordion ou Snackbar próprio no frontend atual.

## Semântica e navegação

Um `header`, navegação nomeada, um `main` visível e `footer`. Portais dos menus
também pertencem a navegações nomeadas. O primeiro controle da aplicação é
“Pular para o conteúdo principal”; Enter foca `#main-content`. Avisos de
armazenamento aparecem depois desse link.

Cada página crítica tem um h1. Indicadores numéricos do dashboard e totais
mantêm a aparência tipográfica sem virar headings. MetaData mantém os títulos
descritivos; a recuperação usa “Falha ao carregar | Fetech”. Não se incluem dados
pessoais em títulos novos.

Mudança de pathname leva o foco ao h1 depois que a rota lazy monta. Query string
de filtro/paginação não refaz esse foco. Back/forward preserva o contexto; retorno
a `#main-content` pode usar o foco nativo do fragmento no main. Não há tabindex positivo.
Links navegam; botões executam ações. Ícones MUI decorativos ficam ocultos da árvore.

## Formulários e mensagens

Labels programáticos; campos obrigatórios nativos e explicação do `*` nos formulários
de conta, entrega e endereço. Autocomplete adequado para nome/e-mail/senhas/endereço.
CEP e telefone continuam strings, com inputMode, preservando zeros à esquerda F012.

Entrega e endereço validam o contrato existente. Erros individuais usam helperText,
aria-describedby e aria-invalid do MUI. O checkout inclui resumo textual anunciado
e foca o primeiro campo inválido; não envia o pedido inválido. Formulários de conta
mantêm validação nativa; AccessibleTextField conecta os erros nativos a helperText,
aria-invalid e aria-describedby, com alerta textual. Também há avisos inline para
erros retornados pela API. Loading tem
texto/status ou progressbar nomeado; sucesso não urgente usa status quando aplicável.
F009 preserva respostas indistinguíveis e F005 continua falhando fechado.

O avatar usa botão nativo que abre o file input, com JPEG/PNG/WebP e 5 MiB descritos.
Seleção gera status textual; erro é associado ao input. Validação de mídia F018
e uploads existentes permanecem intactos.

## Modais, menus, tabelas e catálogo

Dialogs/Drawers continuam usando o trap e restore focus do MUI. Confirmações destrutivas
iniciam no Cancelar; títulos e descrições são associados. A confirmação de anonimização
mantém texto forte exato, irreversibilidade e foco no campo; Escape respeita pending.
Após ações que desabilitam ou removem o trigger, o foco retorna ao cadastro de
categoria/endereço ou ao heading lógico. A restauração aguarda fechamento/pending
e não sobrescreve foco que a pessoa já moveu. Erro da API de anonimização também
aparece dentro do dialog, onde pode ser anunciado.
Tabs têm painel associado; setas, Enter e Space são nativos. Menus têm nomes, estado
expandido, controles e retorno de foco pelo Escape.

Tabelas têm caption, nome, headers scope=col e região rolável focável. Ações repetidas
nomeiam produto/categoria/endereço ou ID da conta/pedido, sem repetir e-mail nos nomes.
Paginação tem labels em português e aria-current; paginação manual anuncia página atual.

Cards usam link separado do botão de adicionar, descrito pelo nome do produto.
Quantidades e remoção contextualizadas; contagem do carrinho em status. Imagens de
produto têm alt descritivo; avatar contextual, logo com link de início nomeado.
Ratings têm equivalente “N de 5 estrelas”; preço anterior/atual textual, estoque
textual. O carrossel não tem autoplay e seus botões mudam imagem sem animação.

## Contraste, foco e reflow

Não se alterou a marca primária #a3123c nem secundária #087f8c. Bordas de inputs
ficaram explícitas no tema: #7a8595 sobre branco (3,74:1); #7d8ba0 sobre #182230
(4,63:1). Antes, o tema não definia essas bordas: vinha o estilo padrão do MUI,
confirmado no código local de OutlinedInput: rgba(0,0,0,0.23) no claro e
rgba(255,255,255,0.23) no escuro. A composição dessas cores sobre os fundos
do tema resulta em 1,74:1 e 2,12:1, respectivamente. São ratios calculados
pela expressão do componente, sem alegação de medição visual humana.

| Par mantido e verificado | Ratio |
|---|---:|
| texto #182230 / #ffffff | 16,03:1 |
| secundário #667085 / #f5f7fa | 4,64:1 |
| botão #ffffff / #a3123c | 7,75:1 |
| botão dark #1a1015 / #f06b91 | 6,39:1 |
| foco claro #087f8c / #ffffff | 4,75:1 |
| foco dark #53c3cd / #182230 | 7,67:1 |

Outline de 3px permanece e é explicitamente aplicado aos ButtonBase que o MUI
reseta. Links textuais MUI ficam sublinhados. Controles principais excedem 24px;
tabelas largas admitem rolagem interna por teclado. Viewports 320×720 e 640×450
(equivalente de reflow a desktop 1280×900 em 200%) verificam fluxo e ausência
de overflow global. Isso não é alegação de zoom manual real do navegador.
prefers-reduced-motion já existia e segue aplicado; não foi adicionado autoplay.

## Ferramenta e testes

`@axe-core/playwright` 4.13, somente devDependency, sobre Playwright/Edge existentes.
O helper executa todas as regras padrão sem exclude, allowlist ou suppression.
Exige zero violações em todas as severidades dos estados cobertos. Não emite HTML
ou valores dos campos nos diagnósticos do axe. Os testes AST usam o parser Babel
já presente, controles nativos, nomes de IconButtons e ausência de tabindex positivo.

Comandos: [TESTES_FET_A11Y_001.md](TESTES_FET_A11Y_001.md). O Commercial Gate inclui
arquitetura e todos os E2E. Inventário pré-fix: [A11Y_BASELINE_ANTES.json](A11Y_BASELINE_ANTES.json).
Resultados e limitações: [RELATORIO_FET_A11Y_001.md](RELATORIO_FET_A11Y_001.md).
Sequências reais de Tab: [A11Y_TECLADO_DEPOIS.json](A11Y_TECLADO_DEPOIS.json).
Probe antes da correção de foco no CRUD: [A11Y_FOCO_CRUD_ANTES.json](A11Y_FOCO_CRUD_ANTES.json).

## Checklist humano complementar

Testar NVDA/JAWS/VoiceOver com navegador suportado; leitura de headings/landmarks,
formulários inválidos, tabelas, CEP, ratings, estados assíncronos e modais. Conferir
ampliação real, espaçamento de texto, alto contraste, navegação somente por teclado
com pessoa usuária e tecnologias assistivas adicionais.

Teclado automatizado: SIM. Teclado manual humano: NÃO. Leitor de tela manual: NÃO.
Zoom manual real: NÃO; equivalente de reflow automatizado: SIM. A automação não
assegura conformidade completa. SEO e performance avançada continuam independentes.

## FET-PERF-002 — carregamento sob demanda

F038 preserva guards, títulos, skip link e foco F033. Fallback de página lazy
tem status/h1 transitório/área reservada; foco ignora esse heading e aguarda o
definitivo. Loader dentro de página/aba mantém parágrafo para não duplicar h1.
Suspense local das abas mantém shell administrativo. Axe sem suppression cobre
fallback atrasado, login/produto/orders/audit/privacy e recovery de chunk, com
back/forward e foco. Foco, contraste e reduced motion preservados.
[Performance frontend](PERFORMANCE_FRONTEND.md) e
[evidências](RELATORIO_FET_PERF_002.md); sem certificação de conformidade.
