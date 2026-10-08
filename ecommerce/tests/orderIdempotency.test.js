const { testUri } = require('./replicaSetHarness');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const h = require('./authHarness');
const { fixtures } = require('./fixtures');
const Order = require('../backend/models/orderModel');
const Product = require('../backend/models/productModel');
const Claim = require('../backend/models/orderIdempotencyModel');
const Address = require('../backend/models/addressModel');
const { createOrderIdempotencyService, validateKey, requestKey, identity } = require('../backend/services/orderIdempotencyService');
const { serializeOrderIntent } = require('../shared/orderIntent.mjs');
const { fork } = require('node:child_process');
const path = require('node:path');
let data, cookie;
before(async () => { await h.start(); data = await fixtures(); cookie = await h.login(data.users.admin); });
after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); await Product.updateMany({}, { Stock: 100 }); });
const shipping = () => ({ recipientName: 'Cliente Fixture', address: 'Rua Fixture', number: '10A', complement: '',
    neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' });
const payload = () => ({ shippingInfo: shipping(), orderItems: [{ product: data.products[0].id, quantity: 1 }] });
const post = (body, key, status, session = cookie, headers = {}) => h.request('POST', '/order/new', body, session, status,
    { ...(key === undefined ? {} : { 'Idempotency-Key': key }), ...headers });

test('IDEM key obrigatória', async () => {
    const count = await Order.countDocuments();
    const a = await post(payload()), b = await post(payload());
    console.log(JSON.stringify({ probe: 'sem-header', orderA: a.result.order?._id, orderB: b.result.order?._id,
        ordersCreated: await Order.countDocuments() - count }));
    assert.equal(a.status, 400); assert.equal(b.status, 400);
    assert.equal(await Order.countDocuments(), count);
});
test('IDEM replay sequencial: exatamente um Order', async () => {
    const key = crypto.randomUUID(), count = await Order.countDocuments();
    const a = await post(payload(), key, 201), b = await post(payload(), key, 201);
    console.log(JSON.stringify({ probe: 'sequencial', orderA: a.result.order._id, orderB: b.result.order._id,
        differentIds: a.result.order._id !== b.result.order._id, ordersCreated: await Order.countDocuments() - count }));
    assert.equal(b.result.order._id, a.result.order._id);
    assert.equal(await Order.countDocuments(), count + 1);
    assert.equal(a.response.headers.get('idempotency-replayed'), null);
    assert.equal(b.response.headers.get('idempotency-replayed'), 'true');
});

for (const key of ['', ' ', 'short', 'a'.repeat(129), 'a'.repeat(15) + ',', 'a'.repeat(16) + '\n', 'a'.repeat(16) + '\t', ' ' + 'a'.repeat(16), 'a'.repeat(16) + ' ', {}, [], 123, null]) {
    test(`IDEM formato de key ${JSON.stringify(key)}`, () => assert.throws(() => validateKey(key), error => error.statusCode === 400));
}
test('IDEM header vazio/curto/longo/vírgula são 400 sem claim', async () => {
    const before = await Claim.countDocuments();
    for (const key of ['', 'short', 'a'.repeat(129), 'multiple,ambiguous-values']) await post(payload(), key, 400);
    assert.equal(await Claim.countDocuments(), before);
});
test('IDEM múltiplos headers e array não são normalizados', () => {
    const key = crypto.randomUUID();
    assert.throws(() => requestKey({ headers: { 'idempotency-key': key }, rawHeaders: ['Idempotency-Key', key, 'idempotency-key', key] }), error => error.statusCode === 400);
    assert.throws(() => requestKey({ headers: { 'idempotency-key': [key] } }), error => error.statusCode === 400);
});
for (const change of ['quantity', 'shipping', 'product']) test(`IDEM conflito ${change}`, async () => {
    const key = crypto.randomUUID(), body = payload(), count = await Order.countDocuments();
    await post(body, key, 201);
    const changed = structuredClone(body);
    if (change === 'quantity') changed.orderItems[0].quantity = 2;
    if (change === 'shipping') changed.shippingInfo.pinCode = '00000001';
    if (change === 'product') changed.orderItems[0].product = data.products[1].id;
    await post(changed, key, 409);
    assert.equal(await Order.countDocuments(), count + 1);
});
test('IDEM fingerprint: ordem de propriedades/itens, trims e duplicados equivalentes', async () => {
    const key = crypto.randomUUID(), body = payload();
    body.orderItems.push({ product: data.products[1].id, quantity: 1 }, { product: data.products[0].id, quantity: 2 });
    const a = await post(body, key, 201);
    const normalized = { orderItems: [{ quantity: 1, product: data.products[1].id }, { quantity: 3, product: data.products[0].id.toUpperCase() }],
        shippingInfo: Object.fromEntries(Object.entries(shipping()).reverse().map(([k, v]) => [k, ` ${v} `])) };
    const b = await post(normalized, key, 201);
    assert.equal(b.result.order._id, a.result.order._id);
    assert.equal(b.response.headers.get('idempotency-replayed'), 'true');
});
test('IDEM replay ignora preços/totais do cliente e mudança de preço/estoque no banco', async (t) => {
    const key = crypto.randomUUID(), body = payload(), product = data.products[0];
    const a = await post({ ...body, totalPriceCents: 1 }, key, 201);
    await Product.updateOne({ _id: product._id }, { $set: { priceCents: 19990, Stock: 0 } });
    try {
        const lookup = t.mock.method(Product, 'findById', () => { throw new Error('Replay não consulta catálogo'); });
        const b = await post({ ...body, totalPriceCents: 90000, orderItems: [{ ...body.orderItems[0], priceCents: 1 }] }, key, 201);
        assert.equal(b.result.order._id, a.result.order._id);
        assert.equal(b.result.order.orderItems[0].priceCents, 10000);
        assert.equal(b.result.order.totalPriceCents, 10000);
        assert.equal(lookup.mock.callCount(), 0);
    } finally { await Product.updateOne({ _id: product._id }, { $set: { priceCents: 10000, Stock: 20 } }); }
});
test('IDEM keys diferentes e case-sensitive permitem intenções diferentes', async () => {
    const key = 'case-sensitive-fixture-ABC', count = await Order.countDocuments();
    const a = await post(payload(), key, 201), b = await post(payload(), key.toLowerCase(), 201);
    assert.notEqual(a.result.order._id, b.result.order._id);
    assert.equal(await Order.countDocuments(), count + 2);
});
test('IDEM scope por usuário impede IDOR', async () => {
    const key = crypto.randomUUID(), other = await h.login(data.users.other);
    const a = await post(payload(), key, 201), b = await post(payload(), key, 201, other);
    assert.notEqual(a.result.order._id, b.result.order._id);
    assert.equal(b.result.order.user, data.users.other.id);
    await h.request('GET', '/order/' + a.result.order._id, null, other, 403);
});
for (const size of [2, 10]) test(`IDEM concorrência ${size} requests: uma criação e estoque inalterado`, async (t) => {
    const key = crypto.randomUUID(), count = await Order.countDocuments(), stock = (await Product.findById(data.products[0].id)).Stock;
    const writes = t.mock.method(Order, 'create', Order.create.bind(Order));
    const responses = await Promise.all(Array.from({ length: size }, () => post(payload(), key)));
    assert.ok(responses.every(r => r.status === 201 || r.status === 409));
    assert.equal(await Order.countDocuments(), count + 1);
    assert.equal(writes.mock.callCount(), 1);
    const ids = new Set(responses.filter(r => r.status === 201).map(r => r.result.order._id));
    assert.equal(ids.size, 1);
    assert.equal((await Product.findById(data.products[0].id)).Stock, stock - 1);
    console.log(JSON.stringify({ probe: 'concorrência', requests: size, ordersCreated: 1,
        createdResponses: responses.filter(r => r.status === 201 && !r.response.headers.get('idempotency-replayed')).length,
        replays: responses.filter(r => r.response.headers.get('idempotency-replayed') === 'true').length,
        processingConflicts: responses.filter(r => r.status === 409).length }));
});
test('IDEM índices únicos reais, partial legado e ausência de TTL', async () => {
    const claimIndexes = await Claim.collection.indexes(), orderIndexes = await Order.collection.indexes();
    const c = claimIndexes.find(i => i.name === 'one_order_intent'), o = orderIndexes.find(i => i.name === 'one_order_per_key');
    assert.equal(c.unique, true); assert.deepEqual(c.key, { user: 1, operation: 1, keyHash: 1 });
    assert.equal(o.unique, true); assert.deepEqual(o.partialFilterExpression, { idempotencyKeyHash: { $type: 'string' } });
    assert.ok(claimIndexes.every(i => i.expireAfterSeconds === undefined));
    const key = crypto.randomUUID(), id = identity(data.users.admin._id, key, serializeOrderIntent(payload()));
    await Claim.create({ ...id, status: 'PROCESSING' });
    await assert.rejects(Claim.create({ ...id, status: 'PROCESSING' }), error => error.code === 11000);
    const order = (await post(payload(), crypto.randomUUID(), 201)).result.order;
    const raw = await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(order._id) });
    const duplicate = { ...raw, _id: new mongoose.Types.ObjectId() };
    await assert.rejects(Order.collection.insertOne(duplicate), error => error.code === 11000);
    delete duplicate.idempotencyKeyHash; delete duplicate.idempotencyRequestHash;
    await Order.collection.insertMany([duplicate, { ...duplicate, _id: new mongoose.Types.ObjectId() }]);
});
test('IDEM raw key/PII ausentes do claim, hashes internos ocultos em todas as respostas', async () => {
    const key = 'UNIQUE-IDEMPOTENCY-SECRET-FIXTURE-123', body = payload();
    body.shippingInfo.recipientName = 'PII_NAME_SENTINEL'; body.shippingInfo.address = 'PII_ADDRESS_SENTINEL';
    const a = await post({ ...body, idempotencyKeyHash: 'forged', idempotencyRequestHash: 'forged' }, key, 201);
    const id = identity(data.users.admin._id, key, serializeOrderIntent(body));
    const claim = await Claim.collection.findOne({ user: data.users.admin._id, keyHash: id.keyHash });
    const order = await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(a.result.order._id) });
    assert.equal(order.idempotencyKeyHash, id.keyHash); assert.equal(order.idempotencyRequestHash, id.requestHash);
    assert.equal(JSON.stringify(order).includes(key), false);
    for (const value of [key, 'PII_NAME_SENTINEL', 'PII_ADDRESS_SENTINEL', '01234567', '04123456789']) assert.equal(JSON.stringify(claim).includes(value), false);
    assert.ok(Object.keys(claim).every(field => ['_id', 'user', 'operation', 'keyHash', 'requestHash', 'status', 'order', 'createdAt', 'updatedAt', '__v'].includes(field)));
    for (const response of [a, await post(body, key, 201), await h.request('GET', '/order/' + order._id, null, cookie, 200),
        await h.request('GET', '/orders/me', null, cookie, 200), await h.request('GET', '/admin/orders', null, cookie, 200)]) {
        assert.equal(JSON.stringify(response.result).includes('idempotencyKeyHash'), false);
        assert.equal(JSON.stringify(response.result).includes('idempotencyRequestHash'), false);
        assert.match(response.response.headers.get('cache-control'), /no-store/);
        assert.equal(response.result.token, undefined);
    }
});
test('IDEM inválidos, CSRF e auth não criam claims nem efeitos comerciais', async () => {
    const count = await Claim.countDocuments(), orders = await Order.countDocuments(), mail = h.mailCount();
    const stock = await Product.find().select('_id Stock').lean(), addresses = await Address.find().lean();
    for (const body of [{}, { ...payload(), shippingInfo: { ...shipping(), pinCode: '123' } },
        { ...payload(), orderItems: [{ product: data.products[0].id, quantity: true }] },
        { ...payload(), orderItems: [{ product: 'invalid', quantity: 1 }] }]) await post(body, crypto.randomUUID(), 400);
    await post({ ...payload(), orderItems: [{ product: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }, crypto.randomUUID(), 404);
    await post(payload(), crypto.randomUUID(), 403, cookie, { 'X-Fetech-CSRF': undefined });
    await post(payload(), crypto.randomUUID(), 401, null);
    assert.equal(await Claim.countDocuments(), count); assert.equal(await Order.countDocuments(), orders);
    assert.deepEqual(await Product.find().select('_id Stock').lean(), stock);
    assert.deepEqual(await Address.find().lean(), addresses); assert.equal(h.mailCount(), mail);
});
test('IDEM PROCESSING antigo sem Order não expira nem reexecuta', async (t) => {
    const key = crypto.randomUUID(), id = identity(data.users.admin._id, key, serializeOrderIntent(payload()));
    await Claim.collection.insertOne({ ...id, status: 'PROCESSING', createdAt: new Date(0), updatedAt: new Date(0) });
    const writes = t.mock.method(Order, 'create', () => { throw new Error('Write indevido'); });
    const response = await post(payload(), key, 409);
    assert.equal(response.response.headers.get('retry-after'), '2'); assert.equal(writes.mock.callCount(), 0);
    assert.equal((await Claim.findOne({ keyHash: id.keyHash })).status, 'PROCESSING');
});
test('IDEM reconcilia PROCESSING + Order legado já salvo', async () => {
    const key=crypto.randomUUID(), count=await Order.countDocuments();
    const id=identity(data.users.admin._id,key,serializeOrderIntent(payload()));
    const saved=await Order.create({idempotencyKeyHash:id.keyHash,idempotencyRequestHash:id.requestHash,
        user:id.user,shippingInfo:shipping(),shippingInfoVersion:2,orderItems:[{name:'Fixture',image:'/Profile.png',product:data.products[0]._id,quantity:1,priceCents:10000}],
        itemsPriceCents:10000,taxPriceCents:0,shippingPriceCents:0,totalPriceCents:10000,paymentInfo:{id:'fixture',status:'Pending'}});
    await Claim.create({...id,status:'PROCESSING'});
    const replay=await post(payload(),key,201);assert.equal(replay.result.order._id,saved.id);
    assert.equal(await Order.countDocuments(),count+1);assert.equal((await Claim.findOne({keyHash:id.keyHash})).status,'COMPLETED');
});

test('IDEM erro owner gera FAILED seguro; replay nunca cria novamente', async (t) => {
    const key = crypto.randomUUID();
    const writes = t.mock.method(Order, 'create', () => { throw Object.assign(new Error('PII_INTERNAL_SENTINEL'), { code: 11000, keyPattern: { anotherIndex: 1 } }); });
    const failed = await post(payload(), key, 503); await post(payload(), key, 409);
    assert.equal(writes.mock.callCount(), 1);
    const id = identity(data.users.admin._id, key, serializeOrderIntent(payload()));
    const record = await Claim.findOne({ keyHash: id.keyHash }).lean();
    assert.equal(record.status, 'PROCESSING'); assert.equal(record.failureCode, undefined);
    assert.equal(JSON.stringify(record).includes('PII_INTERNAL_SENTINEL'), false);
    assert.equal(JSON.stringify(failed.result).includes('PII_INTERNAL_SENTINEL'), false);
});
test('IDEM resposta perdida, snapshot e estado posterior preservados; exclusão não recria', async () => {
    const key = crypto.randomUUID(), body = payload();
    const address = (await h.request('POST', '/address/new', { ...shipping(), label: 'Casa' }, cookie, 201)).result.address;
    const a = await post(body, key, 201);
    await h.request('PUT', '/address/' + address._id, { city: 'Santos' }, cookie, 200);
    await h.request('DELETE', '/address/' + address._id, null, cookie, 200);
    await h.request('PUT', '/admin/order/' + a.result.order._id, { status: 'Shipped' }, cookie, 200);
    const stock = (await Product.findById(data.products[0].id)).Stock;
    const replay = await post(body, key, 201);
    assert.equal(replay.result.order._id, a.result.order._id); assert.equal(replay.result.order.orderStatus, 'Shipped');
    assert.deepEqual(replay.result.order.shippingInfo, shipping());
    assert.equal((await Product.findById(data.products[0].id)).Stock, stock);
    await h.request('DELETE', '/admin/order/' + a.result.order._id, null, cookie, 405);
    await mongoose.connection.db.collection('orders').deleteOne({ _id: new mongoose.Types.ObjectId(a.result.order._id) }); // Fixture de exclusao historica.
    const count = await Order.countDocuments(); await post(body, key, 409); assert.equal(await Order.countDocuments(), count);
});
test('IDEM PROCESSING conclui durante espera sem executar nova criação', async (t) => {
    const key = crypto.randomUUID(), original = Order.create.bind(Order);
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { entered = resolve; });
    const writes = t.mock.method(Order, 'create', async (...args) => { entered(); await gate; return original(...args); });
    const first = post(payload(), key, 201);
    await waiting;
    const second = post(payload(), key, 201);
    await new Promise(resolve => setTimeout(resolve, 150));
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(b.result.order._id, a.result.order._id); assert.equal(writes.mock.callCount(), 1);
    assert.equal(b.response.headers.get('idempotency-replayed'), 'true');
});
test('IDEM segunda barreira recupera Order se o claim estiver ausente', async () => {
    const key = crypto.randomUUID(), count = await Order.countDocuments(), first = await post(payload(), key, 201);
    const id = identity(data.users.admin._id, key, serializeOrderIntent(payload()));
    await Claim.deleteOne({ user: id.user, keyHash: id.keyHash }); // Fixture de perda do registro técnico.
    const replay = await post(payload(), key, 201);
    assert.equal(replay.result.order._id, first.result.order._id);
    assert.equal(await Order.countDocuments(), count + 1);
    assert.equal((await Claim.findOne({ user: id.user, keyHash: id.keyHash })).status, 'COMPLETED');
});
test('IDEM schema exige hashes hexadecimais de 64 caracteres', async () => {
    await assert.rejects(Claim.create({ user: data.users.admin._id, operation: 'ORDER_CREATE_V1', keyHash: 'forged', requestHash: 'forged', status: 'PROCESSING' }), error => error.name === 'ValidationError');
});
test('IDEM erro antes da claim permite corrigir payload e repetir a mesma key', async () => {
    const key = crypto.randomUUID(), id = identity(data.users.admin._id, key, serializeOrderIntent(payload()));
    await post({ ...payload(), shippingInfo: { ...shipping(), city: ' ' } }, key, 400);
    assert.equal(await Claim.countDocuments({ user: id.user, keyHash: id.keyHash }), 0);
    await post(payload(), key, 201);
    assert.equal(await Claim.countDocuments({ user: id.user, keyHash: id.keyHash }), 1);
});
async function independentConnection() {
    const connection = await mongoose.createConnection(testUri(h.database)).asPromise();
    const orders = connection.model('Order', Order.schema), claims = connection.model('OrderIdempotency', Claim.schema);
    await Promise.all([orders.init(), claims.init()]);
    return { connection, orders, service: createOrderIdempotencyService({ Claim: claims, Order: orders }) };
}
function independentCall(instance, key) {
    const inventory=require('../backend/services/orderInventoryService').createOrderInventoryService({
        Order:instance.orders,Product:instance.connection.model('Product',Product.schema),
        Movement:instance.connection.model('StockMovement',require('../backend/models/stockMovementModel').schema),connection:instance.connection});
    return instance.service.execute({user:data.users.admin._id,key,canonical:serializeOrderIntent(payload()),prepare:()=>inventory.prepare(payload()),
        create:(_prepared,hashes,complete)=>inventory.create({intent:payload(),user:data.users.admin._id,hashes,complete})});
}

test('IDEM duas conexões independentes e restart lógico usam mesma garantia persistente', async () => {
    const a = await independentConnection(), b = await independentConnection(), key = crypto.randomUUID(), count = await Order.countDocuments();
    let id;
    try {
        const results = await Promise.all([independentCall(a, key), independentCall(b, key)]);
        assert.equal(results[0].order.id, results[1].order.id); id = results[0].order.id;
        assert.equal(await Order.countDocuments(), count + 1);
    } finally { await Promise.all([a.connection.close(), b.connection.close()]); }
    const restarted = await independentConnection();
    try { assert.equal((await independentCall(restarted, key)).order.id, id); }
    finally { await restarted.connection.close(); }
});
test('IDEM duas APIs em processos distintos não duplicam pedidos', async () => {
    const worker = fork(path.join(__dirname, 'helpers/orderIdempotencyWorker.js'), [], { env: { ...process.env }, silent: true, windowsHide: true });
    try {
        const ready = await new Promise((resolve, reject) => { worker.once('message', value => value.error ? reject(new Error(value.error)) : resolve(value)); worker.once('error', reject); worker.once('exit', () => reject(new Error('Worker encerrado'))); });
        const key = crypto.randomUUID(), count = await Order.countDocuments();
        const responses = await Promise.all([post(payload(), key, 201), fetch(`http://127.0.0.1:${ready.port}/api/v1/order/new`, {
            method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Fetech-CSRF': '1', 'Idempotency-Key': key }, body: JSON.stringify(payload()),
        }).then(async response => ({ status: response.status, result: await response.json() }))]);
        assert.equal(responses[1].status, 201); assert.equal(responses[0].result.order._id, responses[1].result.order._id);
        assert.equal(await Order.countDocuments(), count + 1);
    } finally { if (worker.connected) { const exited = new Promise(resolve => worker.once('exit', resolve)); worker.send('stop'); await exited; } }
});
