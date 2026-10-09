const { markOrderPaidFixture } = require('./helpers/orderPaymentFixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./authHarness');
const { fixtures } = require('./fixtures');
const Order = require('../backend/models/orderModel');
const Product = require('../backend/models/productModel');
const Address = require('../backend/models/addressModel');

const shipping = (extra = {}) => ({ recipientName: 'Cliente Fixture', address: 'Rua Fixture', number: '10A',
    complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil',
    pinCode: '01234567', phoneNo: '04123456789', ...extra });
let data, cookie;
before(async () => { await h.start(); data = await fixtures(); cookie = await h.login(data.users.admin); });
after(h.stop);
beforeEach(h.clearRateLimits);
const payload = (extra = {}) => ({ shippingInfo: shipping(), orderItems: [{ product: data.products[0].id, quantity: 1 }], ...extra });
const post = (body, status) => h.request('POST', '/order/new', body, cookie, status, { 'Idempotency-Key': require('node:crypto').randomUUID() });
async function invalid(body) {
    const orders = await Order.countDocuments(), addresses = await Address.find().lean(), mails = h.mailCount();
    const stocks = await Product.find().select('_id Stock').lean();
    await post(body, 400);
    assert.equal(await Order.countDocuments(), orders);
    assert.deepEqual(await Address.find().lean(), addresses);
    assert.deepEqual(await Product.find().select('_id Stock').lean(), stocks);
    assert.equal(h.mailCount(), mails);
}

test('CHECKOUT leading zeros: persistência e resposta', async () => {
    const { result } = await post(payload(), 201);
    const raw = await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(result.order._id) });
    assert.equal(raw.shippingInfo.pinCode, '01234567');
    assert.equal(raw.shippingInfo.phoneNo, '04123456789');
    assert.deepEqual(result.order.shippingInfo, shipping());
    assert.equal(result.order.shippingInfoVersion, 2);
});
test('CHECKOUT leading zero telefone isolado', async () => {
    const { result } = await post(payload(), 201);
    const raw = await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(result.order._id) });
    assert.equal(raw.shippingInfo.phoneNo, '04123456789');
    assert.equal(result.order.shippingInfo.phoneNo, '04123456789');
});
for (const field of ['recipientName', 'address', 'number', 'neighborhood', 'city', 'state', 'country', 'pinCode', 'phoneNo']) {
    test(`CHECKOUT whitespace ${field}`, () => invalid(payload({ shippingInfo: shipping({ [field]: '   ' }) })));
    for (const value of [12345678, true, {}, [], null, undefined]) {
        test(`CHECKOUT tipo ${field}: ${JSON.stringify(value)}`, () => invalid(payload({ shippingInfo: shipping({ [field]: value }) })));
    }
}
for (const [field, values] of Object.entries({
    pinCode: [-1, '1234567', '123456789', '12A45678', '01234-567', '１２３４５６７８'],
    phoneNo: [-2, '123456789', '1234567890123456', '(11) 99999-9999', 'abcdefghij'],
    complement: [123, true, {}, [], null],
})) for (const value of values) test(`CHECKOUT formato ${field}: ${JSON.stringify(value)}`, () => invalid(payload({ shippingInfo: shipping({ [field]: value }) })));
for (const quantity of [true, false, '1', '2', 1.5, 0, -1, null, undefined, {}, [], NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    test(`CHECKOUT quantity ${String(quantity)} (${typeof quantity})`, () => invalid(payload({ orderItems: [{ product: data.products[0].id, quantity }] })));
}
for (const items of [null, {}, '', [], [null], [{}], [{ product: 'invalid', quantity: 1 }], [{ product: {}, quantity: 1 }]]) {
    test(`CHECKOUT estrutura ${JSON.stringify(items)}`, () => invalid(payload({ orderItems: items })));
}
test('CHECKOUT shippingInfo estrutura ausente/array/escalar', async () => {
    for (const value of [undefined, null, [], 'endereço', 1]) await invalid(payload({ shippingInfo: value }));
});
test('CHECKOUT corpo ausente/array e agrupamento de IDs equivalentes', async () => {
    for (const body of [undefined, {}, []]) await invalid(body);
    await post(payload({ orderItems: [{ product: data.products[0].id, quantity: 11 }, { product: data.products[0].id.toUpperCase(), quantity: 10 }] }), 409);
});
test('CHECKOUT todos os itens validados antes de consultar produtos', async (t) => {
    const spy = t.mock.method(Product, 'findById', () => { throw new Error('Consulta não deveria ocorrer'); });
    await invalid(payload({ orderItems: [{ product: data.products[0].id, quantity: 1 }, { product: 'invalid', quantity: 1 }] }));
    await invalid(payload({ shippingInfo: shipping({ city: ' ' }) }));
    assert.equal(spy.mock.callCount(), 0);
});
test('CHECKOUT NaN e Infinity reais são rejeitados antes de consultas/criação', async (t) => {
    const query = t.mock.method(Product, 'findById', () => { throw new Error('Consulta indevida'); });
    const create = t.mock.method(Order, 'create', () => { throw new Error('Criação indevida'); });
    const controller = require('../backend/controllers/orderController').newOrder;
    for (const quantity of [NaN, Infinity, -Infinity]) {
        const error = await new Promise(resolve => controller({ body: payload({ orderItems: [{ product: data.products[0].id, quantity }] }) }, {}, resolve));
        assert.equal(error.statusCode, 400);
    }
    assert.equal(query.mock.callCount(), 0);
    assert.equal(create.mock.callCount(), 0);
});
test('CHECKOUT produto inexistente mantém 404; estoque insuficiente mantém 400', async () => {
    await post(payload({ orderItems: [{ product: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }), 404);
    await post(payload({ orderItems: [{ product: data.products[0].id, quantity: 21 }] }), 409);
});
test('CHECKOUT trims, complemento opcional, número textual e limites', async () => {
    for (const number of ['10A', 'S/N', 'KM 12']) {
        const input = shipping({ recipientName: '  Cliente  Fixture  ', city: '  Curitiba  ', number, complement: undefined });
        const { result } = await post(payload({ shippingInfo: input }), 201);
        assert.equal(result.order.shippingInfo.recipientName, 'Cliente  Fixture');
        assert.equal(result.order.shippingInfo.city, 'Curitiba');
        assert.equal(result.order.shippingInfo.complement, '');
        assert.equal(result.order.shippingInfo.number, number);
    }
    const r = await post(payload({ shippingInfo: shipping({ complement: '  apto 10  ' }) }), 201);
    assert.equal(r.result.order.shippingInfo.complement, 'apto 10');
    for (const [field, max] of Object.entries({ recipientName: 120, address: 200, number: 30, complement: 120, neighborhood: 120, city: 120, state: 80, country: 80 })) {
        await invalid(payload({ shippingInfo: shipping({ [field]: 'x'.repeat(max + 1) }) }));
    }
});
test('CHECKOUT preço servidor, quantidade válida, whitelist e versão controlada', async () => {
    for (const quantity of [1, 2, 3]) {
        const { result } = await post(payload({ shippingInfoVersion: 1, user: data.users.other.id,
            shippingInfo: { ...shipping(), label: 'Casa', favorite: true, user: data.users.other.id },
            orderItems: [{ product: data.products[0].id, quantity, price: 1, priceCents: 1 }],
            itemsPrice: 1, totalPriceCents: 1, shippingPriceCents: 999, taxPriceCents: 999 }), 201);
        assert.equal(result.order.shippingInfoVersion, 2);
        assert.deepEqual(result.order.shippingInfo, shipping());
        assert.equal(result.order.orderItems[0].priceCents, 10000);
        assert.equal(result.order.totalPriceCents, quantity * 10000);
        assert.equal(result.order.shippingPriceCents, 0);
        assert.equal(result.order.taxPriceCents, 0);
        assert.equal(result.order.user, data.users.admin.id);
    }
});
test('CHECKOUT saved address: edição final, edição/exclusão/favorito não alteram snapshot', async () => {
    const a = (await h.request('POST', '/address/new', { ...shipping(), label: 'Casa', favorite: true }, cookie, 201)).result.address;
    const final = shipping({ city: 'Campinas' });
    const order = (await post(payload({ shippingInfo: { ...a, city: final.city } }), 201)).result.order;
    assert.deepEqual(order.shippingInfo, final);
    await h.request('PUT', '/address/' + a._id, { city: 'Santos' }, cookie, 200);
    const b = (await h.request('POST', '/address/new', { ...shipping(), label: 'Trabalho', favorite: true }, cookie, 201)).result.address;
    await h.request('DELETE', '/address/' + a._id, null, cookie, 200);
    assert.deepEqual((await h.request('GET', '/order/' + order._id, null, cookie, 200)).result.order.shippingInfo, final);
    await h.request('DELETE', '/address/' + b._id, null, cookie, 200);
});
test('CHECKOUT legado: leitura sem reparo e transição de status', async () => {
    const legacy = { shippingInfo: { address: 'Rua Histórica', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: 1234567, phoneNo: 4123456789 },
        user: data.users.admin._id, paymentInfo: { id: 'fixture', status: 'Pending' }, orderStatus: 'Processing',
        orderItems: [{ name: 'Fixture', product: data.products[0]._id, image: '/Profile.png', quantity: 1, priceCents: 10000 }],
        itemsPriceCents: 10000, taxPriceCents: 0, shippingPriceCents: 0, totalPriceCents: 10000 };
    const { insertedId } = await Order.collection.insertOne(legacy);
    const read = await h.request('GET', '/order/' + insertedId, null, cookie, 200);
    assert.equal(read.result.order.shippingInfo.pinCode, '1234567');
    assert.equal(read.result.order.shippingInfo.phoneNo, '4123456789');
    assert.equal((await Order.collection.findOne({ _id: insertedId })).shippingInfo.pinCode, 1234567);
    await h.request('PUT', '/admin/order/' + insertedId, { status: 'Shipped' }, cookie, 409);
    await markOrderPaidFixture(insertedId);
    await h.request('PUT', '/admin/order/' + insertedId, { status: 'Shipped' }, cookie, 200);
    const raw = await Order.collection.findOne({ _id: insertedId });
    assert.deepEqual(raw.shippingInfo, legacy.shippingInfo);
    assert.equal(raw.shippingInfo.recipientName, undefined);
    assert.notEqual(raw.shippingInfoVersion, 2);
    assert.equal(raw.orderStatus, 'Shipped');
});
test('CHECKOUT CSRF, tipos admin e privacidade preservados', async () => {
    await h.request('POST', '/order/new', payload(), cookie, 403, { 'X-Fetech-CSRF': undefined });
    const reply = await post(payload(), 201);
    assert.match(reply.response.headers.get('cache-control'), /no-store/);
    assert.equal(reply.result.token, undefined);
    const admin = await h.request('GET', '/admin/orders', null, cookie, 200);
    const summary = admin.result.orders.find(o => o._id === reply.result.order._id);
    assert.equal(summary.shippingInfo, undefined);
    const order = (await h.request('GET', '/order/' + summary._id, null, cookie, 200)).result.order;
    for (const value of Object.values(order.shippingInfo)) assert.equal(typeof value, 'string');
});
