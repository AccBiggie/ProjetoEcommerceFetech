const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const h = require('./authHarness');
const { fixtures } = require('./fixtures');
const { markOrderPaidFixture } = require('./helpers/orderPaymentFixture');
const Order = require('../backend/models/orderModel');
const Product = require('../backend/models/productModel');
const Movement = require('../backend/models/stockMovementModel');
let data, admin, customer, other;
before(async () => { await h.start(); data = await fixtures(); admin = await h.login(data.users.admin); customer = await h.login(data.users.user); other = await h.login(data.users.other); });
after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); await Product.updateMany({}, { $set: { Stock: 100 } }); });
const raw = () => mongoose.connection.db.collection('orders');
const shipping = { recipientName: 'Fixture', address: 'Rua Fixture', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' };
async function create(extra = {}) {
    const body = { shippingInfo: shipping, orderItems: [{ product: data.products[0].id, quantity: 1 }], ...extra }, key = crypto.randomUUID();
    const reply = await h.request('POST', '/order/new', body, customer, 201, { 'Idempotency-Key': key });
    return { id: reply.result.order._id, oid: new mongoose.Types.ObjectId(reply.result.order._id), body, key, reply };
}
const put = (id, status, expected = 200, extra = {}, cookie = admin, headers) => h.request('PUT', '/admin/order/' + id, { status, ...extra }, cookie, expected, headers);
async function snapshot() {
    const db = mongoose.connection.db;
    return JSON.stringify(await Promise.all(['orders', 'products', 'stockmovements', 'orderidempotencies'].map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray())));
}
async function inventory() {
    const db = mongoose.connection.db;
    return JSON.stringify(await Promise.all(['products', 'stockmovements', 'orderidempotencies'].map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray())));
}
for (const spoof of [{}, { paymentStatus: 'PAID' }, { paidAt: new Date().toISOString() }, { paymentInfo: { status: 'Paid', id: 'PRIVATE_PAYMENT', token: 'PRIVATE_TOKEN' } }]) test(`STATE criação PENDING ignora ${Object.keys(spoof).join() || 'sem spoof'}`, async () => {
    const { oid, reply } = await create(spoof), row = await raw().findOne({ _id: oid });
    assert.equal(row.paymentStatus, 'PENDING'); assert.equal(row.paidAt, undefined); assert.equal(row.paymentInfo.status, 'Pending');
    assert.equal(reply.result.order.paymentStatus, 'PENDING'); assert.equal(reply.result.order.paymentConfirmed, false); assert.equal(reply.result.order.paymentInfo.id, undefined);
});
for (const spoof of [{}, { paymentStatus: 'PAID' }, { paidAt: new Date().toISOString() }, { paymentInfo: { status: 'Paid' } }, { inventoryStatus: 'COMMITTED', Stock: 999, administrativeArchivedAt: new Date().toISOString(), administrativeArchivedBy: 'bad' }]) test(`STATE PENDING não avança com spoof ${Object.keys(spoof).join() || 'sem spoof'}`, async () => {
    const { id } = await create(), before = await snapshot(), reply = await put(id, 'Shipped', 409, spoof);
    assert.equal(reply.result.code, 'ORDER_PAYMENT_NOT_CONFIRMED'); assert.equal(await snapshot(), before);
});
for (const paid of [false, true]) for (const [from, target, allowed] of [['Processing','Processing',true], ['Processing','Shipped',true], ['Processing','Delivered',false], ['Shipped','Shipped',true], ['Shipped','Delivered',true], ['Shipped','Processing',false], ['Delivered','Delivered',true], ['Delivered','Shipped',false], ['Delivered','Processing',false]]) test(`STATE ${from}->${target}, paid=${paid}`, async () => {
    const { id, oid } = await create(); await raw().updateOne({ _id: oid }, { $set: { orderStatus: from } });
    if (paid) await markOrderPaidFixture(id);
    const same = from === target, expected = same || (allowed && paid) ? 200 : 409, before = await snapshot(), stocks = await inventory();
    const reply = await put(id, target, expected);
    if (expected === 409) assert.equal(reply.result.code, allowed ? 'ORDER_PAYMENT_NOT_CONFIRMED' : 'ORDER_STATUS_TRANSITION_INVALID');
    if (same || expected === 409) assert.equal(await snapshot(), before);
    assert.equal(await inventory(), stocks);
    if (expected === 200) assert.equal(reply.result.order.orderStatus, target);
});
for (const status of [undefined, null, true, 42, [], {}, 'Banana', 'Cancelled']) test(`STATE target inválido ${JSON.stringify(status)}`, async () => { const { id } = await create(), before = await snapshot(); await put(id, status, 400); assert.equal(await snapshot(), before); });
for (const fields of [{ paymentStatus: 'PAID' }, { paymentStatus: 'PENDING', paidAt: new Date() }, { paymentStatus: 'PAID', paidAt: '2026-10-08T00:00:00Z' }, { paymentStatus: 'BAD', paidAt: new Date() }, {}]) test(`STATE pagamento inconsistente/legado ${JSON.stringify(fields)}`, async () => {
    const { id, oid } = await create(); await raw().updateOne({ _id: oid }, { $unset: { paymentStatus: '', paidAt: '' } });
    if (Object.keys(fields).length) await raw().updateOne({ _id: oid }, { $set: fields });
    const before = await snapshot(); const reply = await put(id, 'Shipped', 409); assert.equal(reply.result.code, 'ORDER_PAYMENT_NOT_CONFIRMED'); assert.equal(await snapshot(), before);
    for (const cookie of [customer, admin]) assert.equal((await h.request('GET', '/order/' + id, null, cookie, 200)).result.order.paymentConfirmed, false);
    assert.equal((await h.request('GET', '/admin/orders', null, admin, 200)).result.orders.find(order => order._id === id).paymentConfirmed, false);
    assert.equal((await h.request('PATCH', '/admin/order/' + id + '/archive', {}, admin, 200)).result.order.paymentConfirmed, false);
});
test('STATE timestamp textual não vira confirmação no replay ou histórico do cliente', async () => {
    const { id, oid, body, key } = await create();
    await raw().updateOne({ _id: oid }, { $set: { paymentStatus: 'PAID', paidAt: '2026-10-08T00:00:00Z' } });
    const replay = await h.request('POST', '/order/new', body, customer, 201, { 'Idempotency-Key': key });
    assert.equal(replay.result.order.paymentConfirmed, false); assert.equal(replay.result.order._id, id);
    assert.equal((await h.request('GET', '/orders/me', null, customer, 200)).result.orders.find(order => order._id === id).paymentConfirmed, false);
});
test('STATE permissões, CSRF, Origin, ID e inexistente', async () => {
    const { id } = await create(); await put(id, 'Shipped', 401, {}, null); await put(id, 'Shipped', 403, {}, customer);
    await put(id, 'Shipped', 403, {}, admin, { 'X-Fetech-CSRF': null }); await put(id, 'Shipped', 403, {}, admin, { Origin: 'https://hostile.example' });
    await put('invalid', 'Shipped', 400); await put(new mongoose.Types.ObjectId(), 'Shipped', 404);
});
test('STATE archive independente, replay e dados sensíveis privados', async () => {
    const { id, oid, key, body } = await create(); await h.request('PATCH', `/admin/order/${id}/archive`, {}, admin, 200); await put(id, 'Shipped', 409);
    await markOrderPaidFixture(id); await raw().updateOne({ _id: oid }, { $set: { 'paymentInfo.token': 'PRIVATE_TOKEN', 'paymentInfo.card': 'PRIVATE_CARD' } });
    const before = await raw().findOne({ _id: oid }), stocks = await inventory(); await put(id, 'Shipped'); await put(id, 'Delivered');
    const after = await raw().findOne({ _id: oid }); for (const field of ['orderStatus', 'deliveredAt']) { delete before[field]; delete after[field]; }
    assert.deepEqual(after, before); assert.equal(await inventory(), stocks);
    const replay = await h.request('POST', '/order/new', { ...body, paymentStatus: 'PENDING' }, customer, 201, { 'Idempotency-Key': key });
    assert.equal(replay.result.order._id, id); assert.equal(replay.result.order.paymentStatus, 'PAID'); assert.equal(replay.result.order.orderStatus, 'Delivered'); assert.equal(await inventory(), stocks);
    for (const reply of [replay, await h.request('GET', '/order/' + id, null, customer, 200), await h.request('GET', '/order/' + id, null, admin, 200)]) {
        assert.equal(reply.result.order.paymentConfirmed, true); assert.equal(reply.result.order.paymentInfo.id, undefined);
        assert.ok(!JSON.stringify(reply.result).includes('PRIVATE_')); assert.match(reply.response.headers.get('cache-control'), /no-store/); assert.equal(reply.result.token, undefined);
    }
    await h.request('GET', '/order/' + id, null, other, 403); await h.request('DELETE', '/admin/order/' + id, null, admin, 405);
});
for (const status of ['Processing', 'Shipped', 'Delivered']) test(`STATE legacy ${status} é UNVERIFIED sem escrita nem inferência de paymentInfo`, async () => {
    const { id, oid } = await create(); await raw().updateOne({ _id: oid }, { $unset: { paymentStatus: '' }, $set: { orderStatus: status, 'paymentInfo.status': 'Paid' } });
    const before = await snapshot(), detail = await h.request('GET', '/order/' + id, null, customer, 200);
    assert.equal(detail.result.order.paymentStatus, 'UNVERIFIED'); assert.equal(detail.result.order.paymentConfirmed, false); assert.equal(detail.result.order.paymentInfo.status, 'Unverified');
    await put(id, status); assert.equal(await snapshot(), before);
    if (status !== 'Delivered') await put(id, status === 'Processing' ? 'Shipped' : 'Delivered', 409);
    assert.equal(await snapshot(), before);
});
test('STATE dez transições concorrentes ao mesmo target são idempotentes', async () => {
    const { id } = await create(); await markOrderPaidFixture(id); const stocks = await inventory();
    const replies = await Promise.all(Array.from({ length: 10 }, () => put(id, 'Shipped'))); assert.ok(replies.every(reply => reply.status === 200));
    assert.equal((await Order.findById(id)).orderStatus, 'Shipped'); assert.equal(await inventory(), stocks);
});
test('STATE corrida de skip inválido usa estado originalmente observado sem retry', async t => {
    const { id } = await create(); await markOrderPaidFixture(id);
    const original = Order.findById.bind(Order); let reads = 0, release; const barrier = new Promise(resolve => { release = resolve; });
    t.mock.method(Order, 'findById', (...args) => { const query = original(...args), lean = query.lean.bind(query); query.lean = async (...options) => {
        const row = await lean(...options); reads++; if (reads === 2) release(); await barrier; return row;
    }; return query; });
    const [a, b] = await Promise.all([put(id, 'Shipped'), put(id, 'Delivered', 409)]);
    assert.equal(a.status, 200); assert.equal(b.result.code, 'ORDER_STATUS_TRANSITION_INVALID'); assert.equal(reads, 2);
    assert.equal((await raw().findOne({ _id: new mongoose.Types.ObjectId(id) })).orderStatus, 'Shipped');
});
for (const change of ['payment', 'status', 'missing']) test(`STATE CAS zero mapeia concorrência ${change}`, async t => {
    const { id, oid } = await create(); await markOrderPaidFixture(id); const original = Order.findOneAndUpdate.bind(Order);
    t.mock.method(Order, 'findOneAndUpdate', (...args) => { const query = original(...args), lean = query.lean.bind(query); query.lean = async (...options) => {
        assert.equal(args[0].orderStatus, 'Processing'); assert.equal(args[0].paymentStatus, 'PAID'); assert.equal(args[0].paidAt.$type, 'date');
        if (change === 'missing') await raw().deleteOne({ _id: oid });
        else await raw().updateOne({ _id: oid }, { $set: change === 'payment' ? { paymentStatus: 'PENDING' } : { orderStatus: 'Delivered' } });
        return lean(...options);
    }; return query; });
    const reply = await put(id, 'Shipped', change === 'missing' ? 404 : 409);
    if (change !== 'missing') assert.equal(reply.result.code, change === 'payment' ? 'ORDER_PAYMENT_NOT_CONFIRMED' : 'ORDER_STATUS_TRANSITION_INVALID');
});
test('STATE rollback transacional não deixa Order PENDING parcial', async t => {
    const count = await Order.countDocuments(), stock = (await Product.findById(data.products[0].id)).Stock;
    t.mock.method(Movement, 'create', () => { throw new Error('PRIVATE_ROLLBACK'); });
    await h.request('POST', '/order/new', { shippingInfo: shipping, orderItems: [{ product: data.products[0].id, quantity: 1 }] }, customer, 503, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(await Order.countDocuments(), count); assert.equal((await Product.findById(data.products[0].id)).Stock, stock);
});
test('STATE arquitetura sem confirmação produtiva, helpers ou escrita de estoque na transição', () => {
    const fs = require('node:fs'), path = require('node:path');
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(js|jsx|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
    for (const file of [...walk(path.join(__dirname, '../backend')), ...walk(path.join(__dirname, '../frontend/src'))]) {
        const source = fs.readFileSync(file, 'utf8'); assert.equal(/orderPaymentFixture|markOrderPaidFixture|markE2EOrderPaidFixture|\/test\/mark-paid|confirm-payment|mark-paid/.test(source), false, file);
    }
    const service = fs.readFileSync(path.join(__dirname, '../backend/services/orderStateMachine.js'), 'utf8'); assert.equal(/Product|StockMovement|\.save\(/.test(service), false);
});
