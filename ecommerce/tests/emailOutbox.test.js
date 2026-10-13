const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Model = require('../backend/models/emailOutboxModel');
const { enqueue, domainTransaction, modelFor } = require('../backend/services/email/enqueue');
let t, g;
before(async () => { t = await require('./helpers/privacyHarness').start(); g = await t.graph(); });
after(async () => { await t?.stop(); });
test('MAIL pre-fix: persisted Order must have one durable ORDER_CREATED event', async () => {
    assert.equal(await t.db.collection('orders').countDocuments({ _id: require('mongoose').Types.ObjectId.createFromHexString(g.order._id) }), 1);
    assert.equal(await t.db.collection('emailoutboxes').countDocuments({ entityId: require('mongoose').Types.ObjectId.createFromHexString(g.order._id), eventType: 'ORDER_CREATED' }), 1);
});
const base = () => ({ eventType: 'ACCOUNT_REGISTERED', recipientUserId: g.user._id, entityType: 'USER', entityId: g.user._id, dedupeKey: 'ACCOUNT_REGISTERED:' + g.user.id + ':v1' });
for (const field of ['to', 'recipientEmail', 'name', 'subject', 'text', 'html', 'payload', 'password', 'resetToken', 'resetUrl', 'secret', 'stack']) test('MAIL schema rejects forbidden textual field ' + field, () => assert.throws(() => new Model({ ...base(), [field]: 'PERSON_PII_SENTINEL' })));
test('MAIL schema indexes unique dedupe, due ordering and lease; no TTL', () => {
    const indexes = Model.schema.indexes(); assert.ok(indexes.some(([key, options]) => key.dedupeKey === 1 && options.unique)); assert.ok(indexes.some(([key]) => key.nextAttemptAt === 1 && key.createdAt === 1 && key._id === 1)); assert.ok(indexes.every(([, options]) => options.expireAfterSeconds === undefined));
});
test('MAIL unique dedupe forbids duplicate durable event', async () => { await Model.create(base()); await assert.rejects(Model.create(base()), error => error.code === 11000); });
test('MAIL enqueue rejects absent session and unknown event', async () => {
    await assert.rejects(enqueue({ ...base() })); await domainTransaction(Model.db, async session => { await assert.rejects(enqueue({ ...base(), eventType: 'PAYMENT_CONFIRMED' }, session)); });
});
test('MAIL two connections concurrent transactional enqueue share unique event', async () => {
    const mongoose = require('mongoose'), connection = await mongoose.createConnection(require('./replicaSetHarness').testUri(t.h.database)).asPromise();
    const entityId = new mongoose.Types.ObjectId(), data = { eventType: 'ACCOUNT_REGISTERED', recipientUserId: g.user._id, entityId };
    try { await modelFor(connection).init(); await Promise.all([domainTransaction(Model.db, session => enqueue(data, session)), domainTransaction(connection, session => enqueue(data, session, connection))]); assert.equal(await Model.countDocuments({ entityId }), 1); }
    finally { await connection.close(); }
});
test('MAIL Order event has request correlation and no direct PII', async () => {
    const row = await Model.findOne({ eventType: 'ORDER_CREATED', entityId: g.order._id }).lean(); assert.match(row.requestId, require('../backend/observability/logger').uuid); assert.doesNotMatch(JSON.stringify(row), /PERSON_|PRIVATE_AVATAR|13998765432|@example/); assert.equal(row.status, 'PENDING'); assert.equal(t.h.mailCount(), 0);
});
const body = () => ({ shippingInfo: require('./helpers/privacyHarness').shipping, orderItems: [{ product: g.product.id, quantity: 1 }] });
test('MAIL F005 replay and concurrent intent create one Order and one event', async () => {
    const key = crypto.randomUUID(); const replies = await Promise.all([t.h.request('POST', '/order/new', body(), g.cookie, undefined, { 'Idempotency-Key': key }), t.h.request('POST', '/order/new', body(), g.cookie, undefined, { 'Idempotency-Key': key })]);
    assert.ok(replies.every(row => [200, 201].includes(row.status))); assert.equal(replies[0].result.order._id, replies[1].result.order._id);
    const replay = await t.h.request('POST', '/order/new', body(), g.cookie, 201, { 'Idempotency-Key': key }); assert.equal(replay.result.order._id, replies[0].result.order._id); assert.equal(await Model.countDocuments({ entityId: replay.result.order._id }), 1);
});
test('MAIL enqueue failure rolls back Order, Stock, ledger and completion', async context => {
    const names = ['orders', 'stockmovements'], before = {}; for (const name of names) before[name] = await t.db.collection(name).find({}).sort({ _id: 1 }).toArray();
    const product = await require('../backend/models/productModel').findById(g.product.id).lean();
    context.mock.method(Model, 'updateOne', () => { throw new Error('OUTBOX_FAILURE_SENTINEL'); });
    await t.h.request('POST', '/order/new', body(), g.cookie, 503, { 'Idempotency-Key': crypto.randomUUID() });
    for (const name of names) assert.deepEqual(await t.db.collection(name).find({}).sort({ _id: 1 }).toArray(), before[name]); assert.deepEqual(await require('../backend/models/productModel').findById(g.product.id).lean(), product);
    assert.equal(await t.db.collection('orderidempotencies').countDocuments({ status: 'COMPLETED', order: { $nin: before.orders.map(row => row._id) } }), 0);
});
test('MAIL real registration commits User and one account event without provider', async () => {
    await t.h.clearRateLimits(); const reply = await t.h.request('POST', '/register', { name: 'PERSON_NAME_SENTINEL', email: 'email-outbox-register@example.test', password: t.h.password, subject: 'CLIENT_SUBJECT_SENTINEL' }, null, 201);
    assert.equal(await Model.countDocuments({ recipientUserId: reply.result.user._id, eventType: 'ACCOUNT_REGISTERED' }), 1); assert.equal(t.h.mailCount(), 0);
});
test('MAIL registration failure rolls back User', async context => {
    await t.h.clearRateLimits(); context.mock.method(Model, 'updateOne', () => { throw new Error('OUTBOX_FAILURE_SENTINEL'); });
    await t.h.request('POST', '/register', { name: 'Fixture', email: 'email-outbox-rollback@example.test', password: t.h.password }, null, 500); assert.equal(await t.h.User.countDocuments({ email: 'email-outbox-rollback@example.test' }), 0);
});
test('MAIL deactivate/reactivate real changes unique by lifecycle version, repeated change no duplicate', async () => {
    const fresh = await t.h.createUser();
    for (const action of ['deactivate', 'deactivate', 'reactivate', 'reactivate', 'deactivate', 'reactivate']) await t.h.request('PATCH', '/admin/user/' + fresh.id + '/' + action, {}, t.adminCookie, 200);
    for (const eventType of ['ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED']) assert.equal(await Model.countDocuments({ recipientUserId: fresh._id, eventType }), 2);
});
test('MAIL privacy duplicate request has one event and no privacy completed mail', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh); await t.h.request('POST', '/me/privacy/anonymization-request', {}, fresh.cookie, 200);
    assert.equal(await Model.countDocuments({ eventType: 'PRIVACY_REQUEST_CREATED', entityId: pending._id }), 1); await t.deactivate(fresh); const before = await Model.countDocuments({ recipientUserId: fresh.user._id }); await t.execute(fresh, pending); assert.equal(await Model.countDocuments({ recipientUserId: fresh.user._id }), before);
});
test('MAIL F009 reset succeeds directly and never persists secret in outbox', async () => {
    const fresh = await t.h.createUser(), count = await Model.countDocuments({}), mails = t.h.mailCount();
    const token = await t.h.recoveryToken(fresh); assert.equal(t.h.mailCount(), mails + 1); assert.equal(await Model.countDocuments({}), count); assert.doesNotMatch(JSON.stringify(await Model.find({}).lean()), new RegExp(token));
});
test('MAIL F009 provider failure remains uniform and clears reset; nonexistent no provider', async () => {
    await t.h.clearRateLimits(); const fresh = await t.h.createUser(), count = t.h.mailCount(); t.h.setTransportFailure(true);
    try { await t.h.request('POST', '/password/forgot', { email: fresh.email }, null, 200); assert.equal((await t.h.User.findById(fresh.id)).resetPasswordToken, undefined); }
    finally { t.h.setTransportFailure(false); }
    await t.h.request('POST', '/password/forgot', { email: 'missing-email-outbox@example.test' }, null, 200); assert.equal(t.h.mailCount(), count); assert.equal(await Model.countDocuments({ eventType: /RESET/ }), 0);
});
