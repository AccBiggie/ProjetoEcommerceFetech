# Persistência e recuperação do frontend

FET-FRONT-001 / F031, 09/10/2026. Storage é estado local não confiável; preço, autenticação, endereço de checkout e resultado comercial continuam sujeitos aos contratos do backend. Não existe cache persistente de User ou JWT na aplicação. Cookies HttpOnly não pertencem a este registry.

## Inventário factual anterior

| Storage | Key | Dono | Conteúdo anterior | Crítico? | Comportamento anterior |
| --- | --- | --- | --- | --- | --- |
| localStorage | cartItems | store/money/cartAction/Shipping | Array de produtos/quantidades e preço em cents ou legado | Sim, estado do carrinho | loadCartItems tinha try/catch e F014; writes/removal podiam lançar |
| localStorage | shippingInfo | store/cartAction/Shipping | Objeto de dados de entrega | Rascunho pessoal | JSON.parse direto no bootstrap; corrupção causava tela branca |
| localStorage | fetech-color-mode | ColorModeContext | String light/dark | Não | try/catch já existente; sem contrato central/versionamento |
| sessionStorage | fetech.orderAttempt.v1 | orderAttempt/F005 | Objeto key/fingerprint | Sim, recovery comercial | Parse/shape com fail-closed; erro não removia entrada; set antes do POST |

Nenhuma outra key de produção foi encontrada. Object URLs de avatar são temporárias e não persistidas. Logout não apagava storage e continua sem apagamento genérico. Não há cache registrado fictício, duplicação de endereço em nova key ou chave criada a partir de input.

## Contratos atuais

| Key | Storage | Version | Classification | Invalid policy | Generic clear? |
| --- | --- | --- | --- | --- | --- |
| cartItems | localStorage | 1 | CART | Key ilegível/root inválido: default vazio e remoção comparada; itens parcialmente inválidos: preservados/removíveis | Não |
| shippingInfo | localStorage | 1 | USER_DRAFT | Default objeto vazio e remoção comparada da entrada inválida | Não |
| fetech-color-mode | localStorage | 1 | UI_PREFERENCE | Default preferência do sistema e remoção da entrada inválida | Apenas remoção desta key por ação explícita |
| fetech.orderAttempt.v1 | sessionStorage | 1, definido na key | COMMERCIAL_RECOVERY | Bloquear compra; corrupção substituída por marcador técnico de revisão; formato futuro preservado e bloqueado | Nunca |

Cart/shipping/theme têm envelope `{version:1,data:...}` nas novas escritas. Leitores aceitam e normalizam array legado de cart, objeto legado de shipping e string raw light/dark de tema. Reescrita ocorre somente se o raw ainda for o mesmo, preservando alteração concorrente de outra aba. Se write falhar, valor normalizado continua em memória. Helpers são síncronos; leitura repetida é idempotente. Não há sincronização de carrinho entre abas; sincronização de tema continua via evento storage.

Attempt mantém o contrato `{key,fingerprint}`; não se recalcula hash durante leitura/migração. O fingerprint usa o mesmo serializeOrderIntent e SHA-256 de F005. Chave entre 16 e 128 caracteres `[A-Za-z0-9_.:-]`; fingerprint hexadecimal de 64 caracteres. Não inclui payload comercial, endereço, nome, email, JWT ou pagamento. O formato técnico `{recoveryRequired:true}` na mesma key representa somente bloqueio explícito por corrupção.

Versões desconhecidas/futuras não são interpretadas nem apagadas automaticamente: default seguro, aviso e bloqueio de checkout para tentativa comercial. Uma build antiga anterior a F031 não entende envelopes novos; atualizar os assets juntos e evitar rollback direto para essa build com storage já atualizado. Builds F031 futuras devem manter leitores explícitos. A verificação antes de reescrita/remoção reduz races; Storage API não oferece CAS atômico entre abas.

## Implementação

storageRegistry.mjs é a fonte única de keys, versões, classificação, limites, validação e clearPolicy. safeStorage.mjs fornece readStoredValue/writeStoredValue/removeStoredValue, avisos em memória e restauração seletiva. Nenhum componente/reducer faz JSON.parse de storage. Reducers permanecem puros; actions cuidam da persistência.

O acesso ao próprio getter localStorage/sessionStorage fica dentro do try/catch, além de getItem/setItem/removeItem. Leituras devolvem value/ok/recovered/reason/sourceVersion; writes/removes devolvem sucesso ou reason seguro. Valores de chaves desconhecidas não são acessados. JSON inválido, root errado, null, campos inválidos, versão futura e erros da Storage API não derrubam bootstrap.

Limites antes do parse: cart 1.048.576 caracteres e até 1.000 itens; shipping 16.384 caracteres; tema 512; attempt 1.024. São limites defensivos de estrutura, não novas invariantes de catálogo. Decoder faz allowlist e não merge de dados parseados: __proto__/constructor/prototype não contaminam objetos globais. Unknown fields são descartados em cart/shipping/envelopes; attempt rejeita extras para preservar contrato estrito.

## Carrinho e entrega

F014 continua usando readCents/multiplyCents/formatCentsToDecimal compartilhados, sem arredondamento ou fallback de cents inválidos para preço legado. Normalização foi movida para cartDomain.mjs. Itens com preço/quantidade inválidos não são apagados para fazer checkout passar: recebem moneyInvalid, permanecem visíveis e removíveis. Campos que poderiam quebrar render recebem placeholder seguro e bloqueiam checkout. Um root inteiro ilegível retorna carrinho vazio e aviso.

Shipping permite objeto parcial de rascunho com fields conhecidos, somente strings e limites shared/shippingAddress.mjs. CEP/telefone com zeros iniciais e número alfanumérico permanecem strings. No submit, normalizeShippingAddress continua aplicando todas as regras F012. Falha de persistência do rascunho não impede seu uso em memória; backend continua validando o snapshot.

## Proteção comercial F005

Sequência obrigatória: ler/validar → fingerprint/key → persistir tentativa com sucesso → POST /order/new. Falha de acesso, read ou write de sessionStorage impede o POST. Mesmo tentativa anterior legível precisa aceitar escrita antes do novo envio. Não se transfere attempt para localStorage.

Tentativa válida sobrevive a reload, network failure, resposta perdida, 5xx e PROCESSING. 409 same-key/different-payload não causa rotação/reenvio automático. Mudança explícita do draft segue o contrato F005 existente. Sucesso confirmado e erro terminal ORDER_INSUFFICIENT_STOCK removem somente a tentativa correspondente; falha de remove é controlada, sem apagar outras keys.

Tentativa inválida **não prova que o servidor deixou de criar o pedido**. Sua entrada é substituída, quando possível, pelo marcador técnico na mesma key, sem copiar payload para quarantine. Um bloqueio em memória também impede retry silencioso se essa gravação falhar. Reload mantém o bloqueio através do marcador ou da entrada inválida preservada. Versão futura fica intacta e bloqueia.

Checkout mostra aviso e link “Conferir meus pedidos”. Ação “Já conferi meus pedidos; iniciar outra tentativa” pede confirmação explícita, remove somente a entrada comercial inválida/marcador, nunca uma attempt válida, e habilita uma nova tentativa **sem enviar**. Só outro submit explícito pode criar key/pedido. Se o storage continuar indisponível, a ação não libera o envio. Reconciliação manual dos pedidos pode ser necessária.

## UX e recuperação de erros

StorageNotices anuncia problemas locais sem expor SyntaxError/raw/stack. Eventos em memória são deduplicados por storageType/key/reason e podem ser dispensados; não há diagnóstico persistido nem telemetria externa. Falha de cart/draft/theme permite continuar em memória; recovery comercial falha fechado. Nenhum localStorage.clear/sessionStorage.clear existe em produção.

AppErrorBoundary envolve Provider Redux e App/router/layouts. Fallback local Fetech, independente de Redux, API, theme e storage: “Não foi possível carregar esta tela.”, botão “Recarregar página” e ação “Restaurar preferências da interface”. Essa ação remove somente tema, preservando carrinho, rascunho, attempt, chaves desconhecidas e cookie. Foco no heading e botões acessíveis por teclado; CSS local de contraste definido, sem imagem remota.

Boundary captura render, constructor e lifecycle de descendants. Não captura automaticamente event handlers, callbacks async, erros de servidor, carregamento anterior ao runtime ou seu próprio erro. Bootstrap usa imports defensivos de App/store, try/catch e renderBootstrapRecovery estático para falhas antes do root render. Chunk failure detectável nesse fluxo recebe fallback; falha de carregamento do próprio runtime/browser continua limite residual. Em development são registrados somente códigos técnicos FETECH_RENDER_FAILED/FETECH_BOOTSTRAP_FAILED, sem stack/estado; produção não exibe detalhes internos.

## Segurança e diagnóstico

Não há JWT/password/bytes de avatar em registry, PII nova, analytics, Sentry ou endpoint backend para storage. Valores persistidos não autenticam User: /me e cookie são autoridade, inclusive F016. Unknown keys não são usadas nem apagadas genericamente.

Para troubleshooting, conferir funcionamento de storage no navegador, revisar pedidos antes de remover uma tentativa comercial inválida e recarregar após correção. Preferências podem ser restauradas pelo fallback. Não instruir “limpar tudo” como rotina de recovery. Erros do backend continuam seu próprio fluxo e request ID F025; não inventamos request ID para erro React.

Testes usam fake Storage e contextos Playwright isolados, sem storage do desenvolvedor. Harness de erro é compilado/servido apenas no host E2E, fora do bundle e rotas de produção. Evidências: [RELATORIO_FET_FRONT_001.md](RELATORIO_FET_FRONT_001.md). F029/F030/F033/F034/F037 continuam abertos conforme escopo; F024 parcial e F001/F027 adiados.

## F033 — acessibilidade da recuperação

O main persiste no layout durante o loading. Os avisos de armazenamento vêm após
o skip link, preservam aside nomeado com alerta interno e levam foco ao main
quando dispensados. Boundary e bootstrap mantêm main sem substituir seu papel
por alert; o alerta está no texto e o título é “Falha ao carregar | Fetech”.
Foco/recarga continuam locais e não alteram storage, F005 ou auth. E2E auditam as
três falhas do boundary e os estados corrupto/indisponível com axe sem suppression.
[Baseline técnico](ACESSIBILIDADE.md), sem certificação WCAG ou teste manual de AT.

## FET-PERF-002 — falha de módulo lazy

Splitting mantém o ErrorBoundary como última defesa. Probe Playwright substitui
chunk somente no host isolado por módulo com erro e verifica recovery,
heading/foco/axe e storage local/session intactos. Sem rota de crash em
produção, retry automático de pedido ou limpeza de carrinho/tentativa. Boot
guardado de App/store preservado. Harness de desenvolvimento testa replay de
leituras StrictMode, fora do build/rotas produtivos.
[Performance frontend](PERFORMANCE_FRONTEND.md), [testes](TESTES_FET_PERF_002.md).
