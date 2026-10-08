# Entrega FET-ORDER-001 — 08/10/2026

## Resultado e finding tratado

**CONCLUÍDO. F005 / FET-P0-005: CORRIGIDO.**
Proteção persistente para mesma key/user/intenção; não declara F003/F004 corrigidos.

## Branch, HEAD inicial, HEAD final e worktree

Branch `main`. HEAD inicial e final `22012dacee8e86a9f39e28a9ea3d28cdcdfe999e`.
Worktree inicial limpo. FET-DATA-002 já commitada, diferente do contexto antigo
da tarefa anexada. Alterações e commits anteriores preservados. Esta tarefa
permanece sem commit; não foi usado reset/clean nem descartado código anterior.

## Finding reproduzido antes da correção

Dois requests sequenciais com payload equivalente, mesmo usuário, sem header:
Order A `6ac7b7f174e957f37b8fb71a`, Order B `6ac7b7f174e957f37b8fb71d`.
**IDs distintos: SIM; incremento de Orders no probe: 2.**
Outro par com mesma key, então ignorada pelo backend, também criou dois Orders.
Testes permanentes foram executados antes da implementação e falharam como
esperado. Log local ignorado: `.local/idempotency-before.log`.

## Causa raiz e estratégia implementada

Cada POST válido executava Order.create sem identificar a intenção anterior.
Desabilitar botão não fornecia exclusividade persistente ou distribuída.
Agora: header obrigatório, SHA-256, intenção canônica, claim Mongo única,
segunda barreira no Order, replay, reconciliação, tratamento de falhas fechado
e tentativa frontend persistida em sessionStorage.

Inventário de efeitos atuais: criação grava apenas Order. Não muda Stock,
Address/favorito nem envia e-mail. Estoque é descontado na transição de envio
existente. A claim precede o primeiro write comercial, sem mudar esse domínio.

## Contrato HTTP

`Idempotency-Key` obrigatório para POST /api/v1/order/new autenticado com CSRF.
16–128 caracteres ASCII, letras/números/`-_.:`, case-sensitive. UUID seguro
preferencial, sem exclusividade de formato UUID. Sem header, chave vazia/curta/
longa/inválida/ambígua: 400. Validador não usa trim; parser HTTP pode remover
whitespace delimitador antes da aplicação. Duplicação de headers detectada.

Primeira criação: 201, Idempotency-Replayed ausente. Replay: 201,
Idempotency-Replayed: true. Conflito de intenção: 409. PROCESSING pendente:
409, Retry-After: 2. Falha operacional: 503 sanitizado. no-store preservado.

## Modelo de idempotência

OrderIdempotency / coleção orderidempotencies. Campos user, operation, keyHash,
requestHash, status, order, failureCode, createdAt, updatedAt e __v.
Estados PROCESSING/COMPLETED/FAILED. Operation fixa ORDER_CREATE_V1.
Índice unique one_order_intent `(user, operation, keyHash)`.
Acquire por create exclusivo e tratamento de E11000 do padrão esperado.
**TTL: nenhum.** Não há lease, takeover, mutex local ou Map como proteção.

## Campos internos e índice do Order

idempotencyKeyHash/idempotencyRequestHash: strings hexadecimais de 64 caracteres,
select:false, imutáveis. toJSON remove inclusive de documentos recém-criados ou
selecionados internamente. Cliente não controla os campos.
Índice unique one_order_per_key `(user, idempotencyKeyHash)`, parcial
`idempotencyKeyHash: { $type: "string" }`. Vários legados sem hash coexistem.
Nenhuma key retroativa/migração. Startup aguarda init dos dois modelos, sem
syncIndexes. Índices somente exercitados em bases temporárias nesta tarefa.

## Canonical request

Versão ORDER_CREATE_V1. Inclui dez campos normalizados de shipping v2, produto
e quantity. IDs em minúsculas, itens somados por produto e ordenados por ID,
propriedades em ordem fixa. Sem diferença por ordem JSON/trims/duplicados equivalentes.
Exclui preços/totais client-side e atuais do banco, user do body, paymentInfo,
JWT/cookie/CSRF, timestamps e metadados de Address.

keyHash = SHA-256(key). requestHash = SHA-256(key + newline + canonicalRequest).
Não usa JWT_SECRET; sua rotação não muda reconhecimento de keys antigas.
Key aleatória de alta entropia participa do hash do payload. Hash frontend
não é autoridade; backend calcula o seu.

## Persistência de segurança

Raw key no Mongo: **NÃO**. PII/payload/resposta completa no claim: **NÃO**.
Hashes internos na API: **NÃO**, incluindo create/replay/detalhe/listas/admin.
Não grava stacks, logs de key/endereço/telefone ou usa segredo de JWT para hashes.
Ownership de todas as consultas de replay inclui o usuário autenticado.

## Política de replay

Mesma key/user/request: mesmo Order, centavos e snapshot originais; pode exibir
status atual. Mesma key/user/request diferente: 409 sem criar/revelar pedido anterior.
Key diferente/request igual: novo Order deliberado permitido. Outro usuário/key
igual: outro scope, não recebe Order alheio. Produto/preço/estoque atuais não
são consultados para replay já persistido. Order fisicamente excluído não é recriado.

## PROCESSING, crash/reconciliation e FAILED

Polling Mongo 75 ms, janela de 3 s; concluindo durante espera retorna mesmo Order.
Pendência retorna 409/Retry-After 2. PROCESSING sem Order, mesmo antigo, não
expira nem reexecuta automaticamente. Fail closed até futura reconciliação/F004.

Order existente e hashes correspondentes permite marcar COMPLETED e retornar
sem efeitos novamente. Falha na confirmação deixa PROCESSING; retry recupera
o Order. Segunda barreira também recupera pedido com registro técnico ausente.
Após erro de create, tenta localizar Order antes de marcar FAILED. Se não há
Order e as verificações funcionam, failureCode fixo ORDER_CREATE_FAILED.
Se leitura/persistência falha, não libera a intenção. FAILED retorna 409 e nunca
reexecuta. Unknown E11000 não é convertido indiscriminadamente em replay.

## Frontend

crypto.randomUUID, fallback crypto.getRandomValues; nenhum Math.random.
sessionStorage `fetech.orderAttempt.v1`: apenas key/fingerprint SHA-256 da intenção.
Mesmo draft/retry/reload reutiliza key. Mudança semântica de shipping/produtos/
quantity gera outra key no próximo submit explícito. Rede/5xx/PROCESSING/conflito
mantêm tentativa, sem retry automático com key nova. Sucesso confirmado limpa
carrinho e pending attempt. Botão/ref bloqueiam submits simultâneos locais.
Storage indisponível/corrompido falha fechado; sem PII/JWT no registro técnico.
CSRF/cookies/same-origin preservados. Não foi declarado F031 integralmente corrigido.

## Dependências e npm audit

**NENHUMA.** Package e lockfiles não mudaram; npm audit não reexecutado,
conforme a tarefa. Não executado audit fix. Node/Web Crypto/Mongoose existentes.

## Testes focados

`node --test ecommerce/tests/orderIdempotency.test.js`: **39/39**, 6,888 s, exit 0.
`node --test ecommerce/tests/orderIdempotencyFrontend.test.js`: **9/9**, 126 ms, exit 0.
Testes individuais listados abaixo, além das regressões anteriores preservadas.

## API completa

`npm.cmd test --prefix ecommerce`: **545/545**, 31,921 s, exit 0.
497 anteriores + 39 backend + 9 frontend. Inclui F012/F013 e demais suites de segurança.

## Build

`npm.cmd run build --prefix ecommerce/frontend`: **APROVADO**, 865 ms, exit 0.

## E2E

`npm.cmd run test:e2e --prefix ecommerce`: **27/27**, exit 0.
25 anteriores + dois novos cenários completos. Primeira execução: 26/27,
cadastro antigo bloqueado com 429 pelo volume adicional de fixtures. Correção:
novos usuários são preparados diretamente na base temporária do harness e
autenticados por login. Política de rate limiting da aplicação não foi alterada.
Reexecução completa aprovada.

## git diff --check

**APROVADO.** Artefatos/logs de testes ignorados; nenhum segredo incluído.

## Probes pós-correção

| Probe | Resultado |
| --- | --- |
| Sequencial, key omitida do relatório | Order inicial/replay `6ac7baa367088bb35fb3e11d`; incremento 1 |
| 2 requests concorrentes | 1 criação, 1 replay, 0 conflitos; 1 Order |
| 10 requests concorrentes | 1 criação, 9 replays, 0 conflitos; 1 Order |
| Duas conexões independentes | mesmo ID, 1 Order |
| Duas APIs em processos distintos | mesmo ID, 1 Order |
| Restart lógico com nova conexão/service | mesmo Order, sem nova criação |
| Payload diferente, mesma key | 409; nenhum segundo Order |
| Perda de resposta | mesmo Order após retry/reload; confirmado também no navegador |
| Order salvo, completion write falha | 503 inicial, PROCESSING; retry 201, COMPLETED, 1 Order |
| PROCESSING antigo sem Order | 409/Retry-After 2, sem create/expiração |
| FAILED | 409, sem segunda execução |
| Alterar/excluir Address | snapshot original e zeros preservados |
| Preço/estoque atuais alterados | replay usa 10000 cents original, sem catálogo |
| Mesma key/estoque | criação comercial executada uma vez; Stock não muda na criação |
| Replay depois de envio | Stock não descontado novamente |
| Segurança | raw key/PII no claim/hashes internos na API: NÃO/NÃO/NÃO |

**Isso não corrige F003/F004 para keys/intents diferentes.**

## Banco utilizado

Somente bases temporárias do harness `fetech_routes_auth_*`, fixtures isoladas das
suites anteriores e `fetech_e2e_*`, com teardown. Worker independente valida
prefixo do banco temporário antes de conectar. Sem scripts/índices executados
no banco comercial. **BANCO REAL NÃO ALTERADO.** config.env não sobrescrito;
secrets não alterados/expostos. Deployment futuro prepara índices normalmente.

## Remediações anteriores

| Finding | Status |
| --- | --- |
| F006 | CONTINUA CORRIGIDO |
| F007 | CONTINUA CORRIGIDO |
| F008 | CONTINUA CORRIGIDO |
| F009 | CONTINUA CORRIGIDO |
| F010 | CONTINUA CORRIGIDO |
| F012 | CONTINUA CORRIGIDO |
| F013 | CONTINUA CORRIGIDO |
| F014 | CONTINUA CORRIGIDO |
| F020 | CONTINUA CORRIGIDO |
| F021 | CONTINUA CORRIGIDO |
| F036 | CONTINUA CORRIGIDO |

## Findings abertos e riscos residuais

F003 estoque entre intents diferentes; F004 atomicidade/durabilidade pedido/estoque;
F001 pagamento; F011 exclusão física; F024 backup/restore; F027 frete.
PROCESSING órfão sem Order permanece fechado; crash parcial exige futura
reconciliação/atomicidade. Retenção indefinida sem TTL comercial. Pagamento terá
idempotência/webhook própria; F025 observabilidade operacional continua pendente.
Não foram implementados reserva, ledger, transação, frete, pagamento ou refund.

## Documentação, auditoria histórica e impacto de compatibilidade

Criados IDEMPOTENCIA_PEDIDOS.md e este relatório. Atualizados README.md, ROTAS.md,
ESTADO_ATUAL_PROJETO_FETECH.md, PLANO_MELHORIAS_FETECH.md e VALIDACAO_CHECKOUT.md.
Auditoria histórica original: **NÃO ALTERADA**. Alterações fora de escopo: **NENHUMA**.
Header agora obrigatório; frontend adaptado; clientes externos precisam preservar
a key. Replay mesma intenção retorna mesmo Order; conflito retorna 409.
Legados sem hashes continuam válidos e não recebem keys inventadas.
Sessões não foram alteradas pela tarefa. Sem alteração da política monetária.

## Status e próxima task recomendada

**F005 / FET-P0-005: CORRIGIDO.** Próxima recomendação: **F003 + F004 — reserva/
ledger de estoque e atomicidade durável entre pedido e estoque**, para eliminar
overselling e estados parciais. Não iniciadas automaticamente.

## Arquivos e testes individuais

Relação gerada a partir do diff e dos resultados finais dos testes.

### Arquivos criados

- `docs/IDEMPOTENCIA_PEDIDOS.md`
- `docs/RELATORIO_FET_ORDER_001.md`
- `ecommerce/backend/models/orderIdempotencyModel.js`
- `ecommerce/backend/services/orderIdempotencyService.js`
- `ecommerce/frontend/src/utils/orderAttempt.mjs`
- `ecommerce/shared/orderIntent.mjs`
- `ecommerce/tests/e2e/orderIdempotency.spec.js`
- `ecommerce/tests/helpers/orderIdempotencyWorker.js`
- `ecommerce/tests/orderIdempotency.test.js`
- `ecommerce/tests/orderIdempotencyFrontend.test.js`

### Arquivos alterados

- `README.md`
- `ROTAS.md`
- `docs/ESTADO_ATUAL_PROJETO_FETECH.md`
- `docs/PLANO_MELHORIAS_FETECH.md`
- `docs/VALIDACAO_CHECKOUT.md`
- `ecommerce/backend/controllers/orderController.js`
- `ecommerce/backend/models/orderModel.js`
- `ecommerce/backend/server.js`
- `ecommerce/frontend/src/component/Cart/Shipping.jsx`
- `ecommerce/tests/api.test.js`
- `ecommerce/tests/checkoutValidation.test.js`
- `ecommerce/tests/e2e/routes.spec.js`
- `ecommerce/tests/e2e/server.js`
- `ecommerce/tests/fixtures.js`
- `ecommerce/tests/moneyApi.test.js`
- `ecommerce/tests/privateResponseSecurity.test.js`

### Backend (39 testes)

- PASSOU: IDEM key obrigatória
- PASSOU: IDEM replay sequencial: exatamente um Order
- PASSOU: IDEM formato de key ""
- PASSOU: IDEM formato de key " "
- PASSOU: IDEM formato de key "short"
- PASSOU: IDEM formato de key "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
- PASSOU: IDEM formato de key "aaaaaaaaaaaaaaa,"
- PASSOU: IDEM formato de key "aaaaaaaaaaaaaaaa\n"
- PASSOU: IDEM formato de key "aaaaaaaaaaaaaaaa\t"
- PASSOU: IDEM formato de key " aaaaaaaaaaaaaaaa"
- PASSOU: IDEM formato de key "aaaaaaaaaaaaaaaa "
- PASSOU: IDEM formato de key {}
- PASSOU: IDEM formato de key []
- PASSOU: IDEM formato de key 123
- PASSOU: IDEM formato de key null
- PASSOU: IDEM header vazio/curto/longo/vírgula são 400 sem claim
- PASSOU: IDEM múltiplos headers e array não são normalizados
- PASSOU: IDEM conflito quantity
- PASSOU: IDEM conflito shipping
- PASSOU: IDEM conflito product
- PASSOU: IDEM fingerprint: ordem de propriedades/itens, trims e duplicados equivalentes
- PASSOU: IDEM replay ignora preços/totais do cliente e mudança de preço/estoque no banco
- PASSOU: IDEM keys diferentes e case-sensitive permitem intenções diferentes
- PASSOU: IDEM scope por usuário impede IDOR
- PASSOU: IDEM concorrência 2 requests: uma criação e estoque inalterado
- PASSOU: IDEM concorrência 10 requests: uma criação e estoque inalterado
- PASSOU: IDEM índices únicos reais, partial legado e ausência de TTL
- PASSOU: IDEM raw key/PII ausentes do claim, hashes internos ocultos em todas as respostas
- PASSOU: IDEM inválidos, CSRF e auth não criam claims nem efeitos comerciais
- PASSOU: IDEM PROCESSING antigo sem Order não expira nem reexecuta
- PASSOU: IDEM falha em COMPLETED mantém PROCESSING e retry reconcilia Order salvo
- PASSOU: IDEM erro owner gera FAILED seguro; replay nunca cria novamente
- PASSOU: IDEM resposta perdida, snapshot e estado posterior preservados; exclusão não recria
- PASSOU: IDEM PROCESSING conclui durante espera sem executar nova criação
- PASSOU: IDEM segunda barreira recupera Order se o claim estiver ausente
- PASSOU: IDEM schema exige hashes hexadecimais de 64 caracteres
- PASSOU: IDEM erro antes da claim permite corrigir payload e repetir a mesma key
- PASSOU: IDEM duas conexões independentes e restart lógico usam mesma garantia persistente
- PASSOU: IDEM duas APIs em processos distintos não duplicam pedidos

### Frontend (9 testes)

- PASSOU: ATTEMPT gera UUID seguro e registro sem PII/JWT
- PASSOU: ATTEMPT fallback usa getRandomValues sem Math.random
- PASSOU: ATTEMPT retry/reload recria helper e mantém key
- PASSOU: ATTEMPT draft diferente quantity cria nova intenção
- PASSOU: ATTEMPT draft diferente shipping cria nova intenção
- PASSOU: ATTEMPT draft diferente product cria nova intenção
- PASSOU: ATTEMPT preço/totais/ordem/trims e duplicados não mudam fingerprint
- PASSOU: ATTEMPT sucesso remove somente a tentativa confirmada
- PASSOU: ATTEMPT falha de storage é fechada antes de enviar; estado corrompido não gera key silenciosa

### Novos E2E

- PASSOU: duplo submit, resposta perdida e reload recuperam um único pedido.
- PASSOU: 5xx/PROCESSING/conflito mantêm key; carrinho alterado cria outra intenção.
