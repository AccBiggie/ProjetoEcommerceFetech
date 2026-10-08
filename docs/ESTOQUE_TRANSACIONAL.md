# Estoque transacional — FET-ORDER-002

## Disponibilidade e reserva

`Product.Stock` representa a quantidade atualmente disponível para novas
reservas: Number inteiro seguro, não negativo. Cadastro/edição administrativos
rejeitam strings, booleanos, frações, valores negativos e overflow antes do
casting. O model também exige inteiros. Deltas negativos de `$inc` são válidos,
mas o valor resultante de uma reserva nunca pode ser negativo.

O checkout consulta valores brutos com `lean()`, evitando que casting esconda
Stock legado inválido. Dados inválidos são recusados, sem correção automática.
Os demais problemas do catálogo permanecem na F037.

Novos pedidos têm pagamento `Pending`, `inventoryStatus: RESERVED`,
`inventoryVersion: 1` e `inventoryReservedAt`. A reserva retira unidades da
disponibilidade e as associa ao pedido; não confirma pagamento.

**Pedidos Pending mantêm estoque reservado sem expiração automática.** Não há
TTL, cron, RELEASE, COMMIT comercial, pagamento, cancelamento ou refund nesta
versão. Esse consumo de disponibilidade exige acompanhamento operacional.
Futuros pagamento/cancelamento deverão implementar COMMIT ou RELEASE com
transações, idempotência e trilha correspondentes (F001/F028).

## Unidade atômica

Depois de CSRF/auth, validação estrita de entrega/quantidade e preparação
somente leitura de catálogo/centavos, a F005 adquire o claim PROCESSING.
Só o proprietário executa a criação. O claim inicial fica fora da transação.

`ClientSession.withTransaction` revalida produtos, preços e estoque no snapshot.
Processa itens normalizados e ordenados por ObjectId, sequencialmente.
Cada update contém `_id` e `Stock >= quantity`, usando `$inc: -quantity`.
Produtos, movimentos RESERVE, Order e claim COMPLETED participam da mesma
session e do mesmo commit. Falha de qualquer etapa aborta todas as gravações.

Opções: primary, readConcern snapshot, writeConcern majority,
maxCommitTimeMS 10 segundos e timeoutMS total 30 segundos. O driver trata
TransientTransactionError/UnknownTransactionCommitResult; não há loop próprio
de commit nem efeitos externos no callback. O ID do Order permanece estável
durante retries internos. Referência: [transações no driver Node MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

Sem estoque: HTTP 409, `ORDER_INSUFFICIENT_STOCK`, mensagem genérica. Se a
recusa ocorrer após aquisição do claim, ele pode terminar FAILED com esse
código seguro. Se ocorrer antes, nenhuma claim é criada. Retry de um FAILED
desse tipo retorna o mesmo erro terminal. O frontend encerra somente essa
tentativa, conserva o carrinho e usa nova key no próximo submit explícito.
Não cria outro pedido automaticamente.

Falha operacional: 503 `ORDER_TRANSACTION_UNAVAILABLE`. Resultado ambíguo
primeiro consulta Order/claim; sem confirmação, PROCESSING permanece fechado.
Não existe takeover por tempo. PROCESSING usa 409,
`ORDER_IDEMPOTENCY_PROCESSING` e Retry-After; conflito de payload usa
`ORDER_IDEMPOTENCY_CONFLICT`. Esses erros preservam a key no navegador.

## Trilha durável

Model `StockMovement`, collection `stockmovements`: product, order, type
RESERVE, quantity positiva, stockBefore, stockAfter, version 1 e createdAt.
As quantidades são inteiros seguros e `stockAfter = stockBefore - quantity`.
Índice único `one_order_product_movement` em order/product/type impede repetir
o mesmo movimento. Cada item normalizado corresponde a uma única reserva.
Não há endpoint público de movimentos; before/after não são expostos no Order.
Essa trilha cobre reservas novas, não todo o histórico anterior de inventário.

Replay F005 retorna o mesmo Order e não toca Product ou StockMovement.
Reconciliação PROCESSING + Order pré-existente permanece por compatibilidade
com versões intermediárias, sem reservar novamente.

## Topologia e startup

O servidor HTTP exige replica set ou mongos compatível. Após conectar e antes
de preparar índices/aceitar tráfego, verifica hello: sessões lógicas e wire
version compatível com transações (replica set >= 7; mongos >= 8).
Standalone interrompe startup com mensagem segura, sem URI/credenciais.
Não há fallback nem flag de bypass. Scripts somente leitura/bootstrap/seed
mantêm seus requisitos próprios; nenhuma migration de estoque/pedidos roda no
startup. Novos índices são preparados com init, sem syncIndexes.

## Desenvolvimento local dedicado

O banco antigo em `.local/mongo-data` permanece intacto. Para uma loja de
desenvolvimento vazia, use um diretório diferente e uma porta livre. Não
execute iniciação de replica set em instalação/dbpath comercial existente.
Um single-node replica set serve para desenvolvimento/testes; não demonstra
redundância, disponibilidade ou backup de produção.

Terminal MongoDB, somente para o ambiente dedicado novo:

```powershell
$projectRoot = 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech'
$devData = Join-Path $projectRoot '.local\mongo-dev-rs-data'
New-Item -ItemType Directory -Force -Path $devData | Out-Null
& (Join-Path $projectRoot '.local\mongod.exe') --replSet fetech_dev_rs --dbpath $devData --bind_ip 127.0.0.1 --port 27018
```

Em outro terminal, inicialização única desse ambiente novo (não repetir em
replica set já inicializado):

```powershell
Set-Location 'C:\Users\Andre\Documents\GitHub\ProjetoEcommerceFetech\ecommerce'
@'
const { MongoClient } = require('mongoose').mongo;
(async () => {
    const client = new MongoClient('mongodb://127.0.0.1:27018/admin?directConnection=true');
    try {
        await client.connect();
        await client.db().command({ replSetInitiate: {
            _id: 'fetech_dev_rs', members: [{ _id: 0, host: '127.0.0.1:27018' }]
        } });
    } finally { await client.close(); }
})().catch(() => { console.error('Falha no replica set dedicado.'); process.exitCode = 1; });
'@ | node
```

Aguarde a eleição do primary e então execute a API nesse ambiente:

```powershell
$env:DB_URI='mongodb://127.0.0.1:27018/fetech_dev_store?replicaSet=fetech_dev_rs'
npm.cmd start
```

Nenhum desses comandos foi executado no banco real nesta task. O diretório
dedicado começa vazio; não copia produtos/usuários/pedidos comerciais. Para
retomar o Mongo dedicado, repita apenas mongod com os mesmos argumentos.

## Compatibilidade e limites

Pedidos legados sem inventoryStatus permanecem legíveis e conservam o fluxo
de envio anterior, com desconto/compensação. Novos pedidos RESERVED não
descontam novamente ao marcar Shipped/Delivered. Shipping ainda pode ocorrer
com pagamento Pending (F002 aberto).

DELETE físico de RESERVED retorna 409 e preserva Order/movimentos/Stock.
Não devolve estoque. FET-ORDER-003 substitui toda exclusão por DELETE 405 e arquivamento administrativo. F011 corrigido; archive/unarchive preservam a reserva e o ledger. Consulte [Histórico de pedidos](HISTORICO_PEDIDOS.md).
Product pode ser fisicamente removido no catálogo; reservas preservam IDs e
snapshot, mas esse lifecycle ainda exige política de catálogo/post-sale.
Não há release automático nem reconstrução de baseline histórico.

## Auditoria e testes

`npm.cmd run audit:inventory --prefix ecommerce` é READ_ONLY, usa perfil mínimo
inventory-audit e conexão autoIndex/autoCreate false. Detecta Stock inválido,
reservas ausentes, movement órfão/inesperado/duplicado, quantity divergente,
before/after incoerentes, marcadores do protocolo sem status e COMPLETED sem
Order. Só imprime categorias, tipo de entidade e ObjectId. Não pode identificar
todo pedido novo sem nenhum marcador nem provar saldo histórico sem baseline.
Não executada contra o banco comercial.

O runner inicia mongod real com replica set single-node, porta dinâmica e
dbpath `.local/test-mongo-rs-*`, exclusivamente para a suíte. Inicializa apenas
esse mongod; finally encerra o processo e remove apenas o caminho temporário
verificado. Suites usam databases fetech_* com PID/timestamp. FETECH_TEST_MONGOD
pode fornecer um executável alternativo; não adiciona dependências. Falta de
mongod impede testes, sem substituir transações por mocks.

```powershell
node ecommerce/tests/runWithReplicaSet.js --test tests/inventoryTransaction.test.js
node ecommerce/tests/runWithReplicaSet.js --test tests/inventoryAudit.test.js
npm.cmd test --prefix ecommerce
npm.cmd run build --prefix ecommerce/frontend
npm.cmd run test:e2e --prefix ecommerce
git diff --check
```

O runner completo limita a quatro arquivos de teste simultâneos para evitar
sobrecarga de bcrypt/Mongo. Concorrência de requests dentro dos testes continua
real. Teste de crash mata apenas worker próprio antes do commit, verifica zero
writes visíveis e encerra sua sessão órfã no Mongo temporário após as asserções,
permitindo teardown imediato. Não toca processos de Mongo existentes.
