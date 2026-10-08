const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { testUri } = require('./replicaSetHarness');
const { auditOrders } = require('../backend/utils/orderHistoryAudit');
const database = `fetech_payment_audit_${process.pid}_${Date.now()}`;
before(() => mongoose.connect(testUri(database)));
after(async () => { try { if (mongoose.connection.name === database) await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); } });
beforeEach(() => mongoose.connection.db.collection('orders').deleteMany({}));
const cases = [
    ['Processing', {}, ['LEGACY_PAYMENT_UNVERIFIED']],
    ['Shipped', {}, ['LEGACY_PAYMENT_UNVERIFIED','SHIPPED_WITHOUT_CONFIRMED_PAYMENT']],
    ['Delivered', {}, ['LEGACY_PAYMENT_UNVERIFIED','DELIVERED_WITHOUT_CONFIRMED_PAYMENT']],
    ['Shipped', { paymentStatus: 'PENDING' }, ['SHIPPED_WITHOUT_CONFIRMED_PAYMENT']],
    ['Delivered', { paymentStatus: 'PENDING' }, ['DELIVERED_WITHOUT_CONFIRMED_PAYMENT']],
    ['Processing', { paymentStatus: 'PAID' }, ['PAID_WITHOUT_PAID_AT']],
    ['Shipped', { paymentStatus: 'PAID', paidAt: '2026-10-08T00:00:00Z' }, ['PAID_WITHOUT_PAID_AT','SHIPPED_WITHOUT_CONFIRMED_PAYMENT']],
    ['Processing', { paymentStatus: 'PENDING', paidAt: new Date() }, ['PAID_AT_WITHOUT_PAID_STATUS']],
    ['Processing', { paymentStatus: 'PRIVATE_UNKNOWN' }, ['UNKNOWN_PAYMENT_STATUS']],
    ['Processing', { paymentStatus: 'PENDING' }, []],
    ['Delivered', { paymentStatus: 'PAID', paidAt: new Date() }, []],
];
for (const [status, payment, categories] of cases) test(`PAYMENT AUDIT ${status} ${JSON.stringify(payment)} READ_ONLY e sem PII`, async () => {
    const db = mongoose.connection.db;
    await db.collection('orders').insertOne({ orderStatus: status, ...payment, user: 'PRIVATE_USER', shippingInfo: { address: 'PRIVATE_ADDRESS', pinCode: 'PRIVATE_CEP', phoneNo: 'PRIVATE_PHONE' }, paymentInfo: { id: 'PRIVATE_CARD', token: 'PRIVATE_TOKEN', status: 'Paid' } });
    const before = await db.collection('orders').find({}).toArray(), lines = [], result = await auditOrders(mongoose.connection, { write: line => lines.push(line) });
    assert.deepEqual(result.issues.map(issue => issue.category), categories);
    assert.deepEqual(await db.collection('orders').find({}).toArray(), before);
    assert.equal(result.summary.mode, 'READ_ONLY'); assert.ok(!lines.join('').includes('PRIVATE_'));
});
test('PAYMENT AUDIT só precisa de find, nenhuma API de escrita disponível', async () => {
    const collections = [];
    const connection = { db: { collection: name => { collections.push(name); return { find: () => ({ toArray: async () => [] }) }; } } };
    assert.equal((await auditOrders(connection, { write: () => {} })).summary.issues, 0);
    assert.deepEqual(collections, ['orders', 'orderidempotencies', 'stockmovements']);
});
