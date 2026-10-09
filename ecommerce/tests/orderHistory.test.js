const { markOrderPaidFixture } = require('./helpers/orderPaymentFixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const h = require('./authHarness');
const { fixtures } = require('./fixtures');
const Order = require('../backend/models/orderModel');
let data, admin, customer, other;
const raw = () => mongoose.connection.db.collection('orders');
before(async () => { await h.start(); data = await fixtures(); admin = await h.login(data.users.admin); customer = await h.login(data.users.user); other = await h.login(data.users.other); });
after(h.stop);
beforeEach(h.clearRateLimits);
const shipping = { recipientName: 'Fixture', address: 'Rua Fixture', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' };
async function create() {
    const body = { shippingInfo: shipping, orderItems: [{ product: data.products[0].id, quantity: 1 }] }, key = crypto.randomUUID();
    const reply = await h.request('POST', '/order/new', body, customer, 201, { 'Idempotency-Key': key });
    return { id: reply.result.order._id, key, body };
}
const patch = (id, archived, cookie = admin, expected = 200, headers) => h.request('PATCH', `/admin/order/${id}/${archived ? 'archive' : 'unarchive'}`, {}, cookie, expected, headers);
async function commercial(id) {
    const order = await raw().findOne({ _id: new mongoose.Types.ObjectId(id) });
    delete order.administrativeArchivedAt; delete order.administrativeArchivedBy;
    return JSON.stringify({ order, stock: await mongoose.connection.db.collection('products').find({}).toArray(), movements: await mongoose.connection.db.collection('stockmovements').find({}).toArray(), claims: await mongoose.connection.db.collection('orderidempotencies').find({}).toArray() });
}
for (const status of ['Processing', 'Shipped', 'Delivered']) for (const legacy of [false, true]) test(`HISTORY DELETE 405 e archive preservam ${status}, legacy=${legacy}`, async () => {
    const { id } = await create();
    await raw().updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { orderStatus: status }, ...(legacy ? { $unset: { inventoryStatus: '', inventoryVersion: '', inventoryReservedAt: '', administrativeArchivedAt: '', administrativeArchivedBy: '' } } : {}) });
    const before = await commercial(id);
    const deleted = await h.request('DELETE', '/admin/order/' + id, null, admin, 405);
    assert.equal(deleted.response.headers.get('allow'), 'PATCH'); assert.equal(await commercial(id), before);
    const archived = await patch(id, true); assert.equal(archived.result.order.administrativeArchivedBy, data.users.admin.id);
    assert.equal(await commercial(id), before);
    assert.deepEqual((await patch(id, true)).result.order, archived.result.order);
    await patch(id, false); await patch(id, false); assert.equal(await commercial(id), before);
});
test('HISTORY permissões, CSRF, Origin, IDs e inexistente', async () => {
    const { id } = await create();
    for (const archived of [true, false]) {
        await patch(id, archived, null, 401); await patch(id, archived, customer, 403);
        await patch(id, archived, admin, 403, { Origin: 'https://hostile.example' });
        await patch(id, archived, admin, 403, { 'X-Fetech-CSRF': null });
        await patch('invalid', archived, admin, 400); await patch(new mongoose.Types.ObjectId(), archived, admin, 404);
    }
    await h.request('DELETE', '/admin/order/' + new mongoose.Types.ObjectId(), null, admin, 405);
    await h.request('DELETE', '/admin/order/invalid', null, admin, 400);
    await h.request('DELETE', '/admin/order/' + id, null, customer, 403);
    await h.request('DELETE', '/admin/order/' + id, null, null, 401);
});
test('HISTORY replay, privacidade, filtros e detalhes arquivados', async () => {
    const { id, body, key } = await create(); await patch(id, true); const before = await commercial(id);
    const replay = await h.request('POST', '/order/new', body, customer, 201, { 'Idempotency-Key': key });
    assert.equal(replay.result.order._id, id); assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
    for (const reply of [replay, await h.request('GET', '/order/' + id, null, customer, 200)]) {
        assert.equal(reply.result.order.administrativeArchivedBy, undefined); assert.equal(reply.result.order.administrativeArchivedAt, undefined);
        assert.equal(reply.result.order.idempotencyKeyHash, undefined); assert.match(reply.response.headers.get('cache-control'), /no-store/);
    }
    assert.ok((await h.request('GET', '/orders/me', null, customer, 200)).result.orders.some(order => order._id === id));
    await h.request('GET', '/order/' + id, null, other, 403);
    assert.ok((await h.request('GET', '/order/' + id, null, admin, 200)).result.order.administrativeArchivedAt);
    for (const filter of ['', '?archived=active', '?archived=archived', '?archived=all']) {
        const reply = await h.request('GET', '/admin/orders' + filter, null, admin, 200);
        assert.equal(reply.result.orders.some(order => order._id === id), filter.endsWith('archived') || filter.endsWith('all'));
        assert.equal(reply.result.totalAmountCents, reply.result.orders.reduce((sum, order) => sum + order.totalPriceCents, 0));
    }
    for (const query of ['archived=bad', 'archived=', 'archived=active&archived=all', 'archived=active&archived=active', 'archived[x]=active']) await h.request('GET', '/admin/orders?' + query, null, admin, 400);
    assert.equal(await commercial(id), before); await patch(id, false);
    assert.equal((await h.request('POST', '/order/new', body, customer, 201, { 'Idempotency-Key': key })).result.order._id, id);
});
test('HISTORY concorrência 10 archives e corrida archive/unarchive mantêm par atômico', async () => {
    const { id } = await create(); const before = await commercial(id);
    const replies = await Promise.all(Array.from({ length: 10 }, () => patch(id, true)));
    assert.equal(new Set(replies.map(reply => reply.result.order.administrativeArchivedAt)).size, 1);
    await Promise.all(Array.from({ length: 10 }, (_, i) => patch(id, i % 2 === 0)));
    const row = await raw().findOne({ _id: new mongoose.Types.ObjectId(id) });
    assert.equal(row.administrativeArchivedAt != null, row.administrativeArchivedBy != null); assert.equal(await commercial(id), before);
});
test('HISTORY guardas de modelo/documento/collection/bulkWrite impedem exclusão', async () => {
    const { id } = await create(), doc = await Order.findById(id);
    const operations = [() => Order.deleteOne({ _id: id }), () => Order.deleteMany({}), () => Order.findOneAndDelete({ _id: id }), () => Order.findByIdAndDelete(id), () => doc.deleteOne(), () => Order.collection.deleteOne({ _id: doc._id }), () => Order.collection.deleteMany({}), () => Order.collection.findOneAndDelete({ _id: doc._id }), () => Order.bulkWrite([{ deleteOne: { filter: { _id: doc._id } } }]), () => Order.bulkWrite([{ deleteMany: { filter: {} } }], { skipMiddleware: true })];
    for (const operation of operations) await assert.rejects(operation, { code: 'ORDER_PHYSICAL_DELETE_FORBIDDEN' });
    assert.ok(await Order.findById(id));
    assert.equal(typeof Order.findOneAndRemove, 'undefined');
});
test('HISTORY arquivado permite transições existentes e preserva referência ao ator desativado', async () => {
    const { id } = await create(), actor = await h.createUser('admin'), cookie = await h.login(actor);
    await markOrderPaidFixture(id);
    await patch(id, true, cookie);
    await h.request('PUT', '/admin/order/' + id, { status: 'Shipped' }, admin, 200);
    await h.request('PUT', '/admin/order/' + id, { status: 'Delivered' }, admin, 200);
    await h.request('PATCH', '/admin/user/' + actor.id + '/deactivate', null, admin, 200);
    const reply = await h.request('GET', '/order/' + id, null, admin, 200);
    assert.equal(reply.result.order.administrativeArchivedBy, actor.id);
    assert.equal((await h.User.findById(actor.id)).accountStatus, 'DEACTIVATED');
    assert.equal(reply.result.order.orderStatus, 'Delivered');
});
