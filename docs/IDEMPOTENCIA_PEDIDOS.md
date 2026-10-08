# Idempotência persistente de pedidos — FET-ORDER-001

Contrato vigente em 08/10/2026. F005 / FET-P0-005 corrigido para a mesma intenção,
identificada pela chave e pelo usuário. F003/F004 continuam abertos para intents
diferentes e atomicidade de estoque. Nenhuma operação desta tarefa usa o banco real.

## Contrato externo

```http
POST /api/v1/order/new
Idempotency-Key: <chave-aleatória-única>
X-Fetech-CSRF: 1
Content-Type: application/json
```

Sessão válida continua obrigatória. Body segue [VALIDACAO_CHECKOUT.md](VALIDACAO_CHECKOUT.md).
Chave obrigatória: string case-sensitive, 16–128 caracteres, somente letras
ASCII, números, `-`, `_`, `.`, `:`. UUID seguro é preferencial, mas outros formatos
permitidos funcionam. Sem header/valor inválido: 400. Sem trim/lowercase da chave;
espaços no valor recebido, controles, vírgula, arrays e múltiplos headers são
rejeitados. O parser HTTP pode remover whitespace de delimitação do header antes
da aplicação; o validador da chave nunca normaliza o valor que recebe.

| Solicitação | Resultado |
| --- | --- |
| Primeira key válida | 201, header Idempotency-Replayed ausente |
| Mesma key/user/payload canônico | 201, mesmo Order, Idempotency-Replayed: true |
| Mesma key/user, payload diferente | 409, sem nova criação |
| Key diferente, mesmo payload | nova intenção e novo Order permitidos |
| Outro usuário, mesma key | scope independente, sem acesso ao Order alheio |
| PROCESSING sem Order | espera limitada; depois 409 e Retry-After: 2 |
| FAILED | 409; não reexecuta automaticamente |
| Order concluído fisicamente excluído | 409; key não recria o pedido |
| Falha operacional de confirmação | 503 sanitizado; conferir pedidos e repetir mesma key |

Replay preserva preços/totais/snapshot originais e pode retornar o estado atual
do Order (por exemplo, Shipped). Não exige que produto/preço/estoque atuais ainda
sejam os mesmos. Clientes externos precisam enviar a nova chave em cada intenção
e preservá-la em retries; um timeout nunca deve gerar automaticamente outra key.

## Canonical request e hashes

`ecommerce/shared/orderIntent.mjs` centraliza a intenção `ORDER_CREATE_V1`:
shipping v2 normalizado nos dez campos, IDs de produtos hexadecimais em minúsculas
e quantities inteiras positivas. Itens repetidos são somados, conforme a semântica
preexistente; ordenação por ID elimina diferença de ordem sem significado comercial.
Propriedades do objeto são serializadas em ordem controlada. Complemento ausente
e vazio são equivalentes; trims externos não alteram identidade.

Excluídos: preços/totais enviados pelo cliente, preço atual do banco, paymentInfo,
user do body, JWT/cookie/CSRF e metadados da agenda. Backend calcula centavos F014.

```text
keyHash = SHA-256(key)
requestHash = SHA-256(key + "\n" + canonicalRequest)
canonicalRequest inclui version = ORDER_CREATE_V1
```

Não usa JWT_SECRET; sua rotação não muda a identidade da tentativa. Key oficial
é aleatória de alta entropia e também participa do hash do request. Registro
técnico não contém key bruta, payload, endereço, CEP, telefone, resposta JSON
ou stack. Não são registrados logs com key/PII. F025 observabilidade continua pendente.

## Persistência e concorrência

Model `OrderIdempotency`, coleção `orderidempotencies`. Campos: user, operation,
keyHash, requestHash, status, order opcional, failureCode opcional, createdAt,
updatedAt e metadados Mongoose. Hashes são hexadecimais de 64 caracteres.
Status: PROCESSING, COMPLETED, FAILED. Operation fixa ORDER_CREATE_V1.

Índice `one_order_intent`: unique `(user, operation, keyHash)`. Claim adquirida por
create atômico; E11000 somente do padrão esperado carrega a tentativa existente.
Não existe mutex/Map local para exclusividade, lease, TTL ou expiração automática.

Order guarda `idempotencyKeyHash` e `idempotencyRequestHash` internos, imutáveis
e `select: false`. Transform toJSON também os remove de documentos recém-criados
e consultas que precisem selecionar os hashes para reconciliação. Mass assignment
do cliente não controla os campos.

Índice `one_order_per_key`: unique `(user, idempotencyKeyHash)`, parcial
`idempotencyKeyHash: { $type: "string" }`. Múltiplos pedidos legados sem hash
coexistem. Não há migração ou chaves retroativas. Índice secundário impede outra
gravação e permite recuperar Order mesmo se o registro técnico precisar ser refeito.

Startup aguarda Order.init() e OrderIdempotency.init() antes de abrir a porta,
além das preparações existentes. Não usa syncIndexes nem remove índices.
Índices foram exercitados somente em bases temporárias nesta tarefa; deployment
futuro deve preparar os índices normalmente, com o procedimento operacional apropriado.

## Pipeline e falhas

CSRF/auth precedem o controller. Validação F012/F013, canonicalização e formato
da key ocorrem antes de writes. Busca técnica permite replay/reconciliação antes
de consultar preços/estoque atuais. Nova intenção valida produtos, estoque e
centavos em modo somente leitura; só então adquire claim antes do único write
comercial atual, Order.create. Criação não desconta Stock nem envia e-mail;
estoque continua sendo descontado no envio, conforme o fluxo anterior.

Owner salva Order com hashes, marca COMPLETED e responde. Duplicatas jamais
executam create de novo. PROCESSING usa polling Mongo de 75 ms, até 3 segundos;
se o Order aparecer nesse período, reconcilia e retorna. Se não aparecer,
retorna 409/Retry-After 2 mantendo a claim permanentemente bloqueada.

Order salvo + PROCESSING permite reconciliação segura por user/keyHash/requestHash,
sem repetir efeitos comerciais. Falha ao gravar COMPLETED retorna 503 e deixa
PROCESSING recuperável pelo Order. Quando create falha, o serviço primeiro procura
Order para verificar write de resultado ambíguo; se não existe e a verificação
funciona, tenta marcar FAILED com código fixo ORDER_CREATE_FAILED. Se não consegue
ler/persistir esse estado, a claim permanece fechada. FAILED nunca é retomado
automaticamente. Sem Order e com PROCESSING órfão não há takeover por tempo.

Mesmo que o pedido seja excluído pelo endpoint administrativo atual, a claim
concluída permanece e bloqueia recriação. F011 exclusão física continua pendente.

## Frontend

`frontend/src/utils/orderAttempt.mjs` gera crypto.randomUUID(), com fallback
crypto.getRandomValues. Nunca usa Math.random. Antes do POST, grava em
sessionStorage `fetech.orderAttempt.v1` somente `{ key, fingerprint }`.
Fingerprint local SHA-256 usa a mesma canonicalização sem preços/totais;
backend recalcula seu próprio hash e não confia no fingerprint do navegador.

Mesmo draft reutiliza key entre submits e reload. Mudança semântica de shipping,
produtos ou quantidade gera nova key no próximo submit explícito. Erro de rede,
5xx, PROCESSING ou conflito mantém a tentativa; não há retry automático com nova
key. Erro aparece para o usuário, que pode conferir pedidos antes de outra intenção.
Sucesso confirmado limpa carrinho e pending attempt. Botão desabilitado e ref
impedem submit simultâneo local; a garantia de integridade permanece no MongoDB.

Storage técnico não duplica PII nem JWT. Estado inválido/indisponível falha fechado
sem enviar nova key silenciosamente. Isso não resolve integralmente F031 de
storage geral. Axios mantém CSRF, cookies e política same-origin; CORS não mudou.
Respostas privadas, incluindo replay/erros, continuam no-store e sem JWT JSON.

## Verificação e limites

```powershell
node --test ecommerce/tests/orderIdempotency.test.js
node --test ecommerce/tests/orderIdempotencyFrontend.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
git diff --check
```

Testes cobrem Mongo/indexes reais, duas conexões, duas APIs em processos distintos,
restart lógico, falha de confirmação, FAILED/PROCESSING, replay e privacidade.
E2E cobre duplo submit, perda de resposta após persistência, reload, 5xx/409 e
mudança de carrinho. Sem dependências, locks ou configs de ambiente novas.

Riscos: PROCESSING órfão sem Order exige futura reconciliação; F003 permite
disputa de Stock entre intents diferentes; F004 não garante atomicidade durável;
retenção comercial ainda indefinida (sem TTL nesta tarefa); pagamento terá
idempotência/webhooks próprios; observabilidade operacional será ampliada.
F001 pagamento, F011 exclusão física, F024 backup/restore e F027 frete continuam abertos.
Nenhuma transação/reserva/ledger/gateway foi implementada. Próxima recomendação:
F003 + F004, sem início automático.
