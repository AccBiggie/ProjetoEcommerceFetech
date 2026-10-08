const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { start } = require('./helpers/observabilityHarness');
const { auditUserReferences } = require('../backend/utils/userReferenceAudit');
let instance, db, owner, logs;
const names = ['users', 'addresses', 'orders', 'products', 'orderidempotencies', 'adminauditevents', 'adminmutationlocks'];
before(async () => { instance = await start(); db = mongoose.connection.db; });
after(async () => { await instance?.stop(); });
beforeEach(async () => {
    assert.ok(instance.h.database === mongoose.connection.name); logs = [];
    for (const name of names) await db.collection(name).deleteMany({});
    owner = new mongoose.Types.ObjectId(); await db.collection('users').insertOne({ _id: owner, email: 'owner@fixture.test', accountStatus: 'ACTIVE' });
});
const audit = () => auditUserReferences(mongoose.connection, { write: line => logs.push(line) });
test('URA-01 empty references produces safe READ_ONLY summary', async () => { const { summary, issues } = await audit(); assert.equal(summary.mode, 'READ_ONLY'); assert.equal(summary.users, 1); assert.equal(issues.length, 0); });
for (const [collection, field, relation] of [
    ['addresses', 'user', 'Address.user'], ['orders', 'user', 'Order.user'], ['orders', 'administrativeArchivedBy', 'Order.administrativeArchivedBy'],
    ['orderidempotencies', 'user', 'OrderIdempotency.user'], ['products', 'user', 'Product.user'], ['adminauditevents', 'actorUserId', 'AdminAuditEvent.actorUserId'],
    ['users', 'deactivatedBy', 'User.deactivatedBy'],
]) test('URA orphan detected for ' + relation + ' without PII', async () => {
    const missing = new mongoose.Types.ObjectId(); await db.collection(collection).insertOne({ [field]: missing,
        ...(collection === 'orders' && field !== 'user' ? { user: owner } : {}), name: 'PRIVATE_NAME', email: 'private@example.test', password: 'PRIVATE_PASSWORD', phone: 'PRIVATE_PHONE' });
    const { issues } = await audit(); assert.ok(issues.some(issue => issue.relation === relation && issue.missingUserId === String(missing)));
    assert.doesNotMatch(logs.join(''), /PRIVATE_|private@example/);
});
test('URA Product embedded review user orphan detected', async () => {
    const missing = new mongoose.Types.ObjectId(); await db.collection('products').insertOne({ user: owner, reviews: [{ _id: new mongoose.Types.ObjectId(), user: missing, comment: 'PRIVATE_REVIEW' }] });
    const { issues } = await audit(); assert.ok(issues.some(issue => issue.relation === 'Product.reviews.user')); assert.doesNotMatch(logs.join(''), /PRIVATE_REVIEW/);
});
test('URA active/deactivated/legacy references all resolve without false orphans', async () => {
    const inactive = new mongoose.Types.ObjectId(), legacy = new mongoose.Types.ObjectId();
    await db.collection('users').insertMany([{ _id: inactive, email: 'inactive@fixture.test', accountStatus: 'DEACTIVATED', deactivatedAt: new Date(), deactivatedBy: owner }, { _id: legacy, email: 'legacy@fixture.test' }]);
    for (const user of [owner, inactive, legacy]) await db.collection('addresses').insertOne({ user });
    const { summary, issues } = await audit(); assert.equal(issues.length, 0); assert.equal(summary.active, 2); assert.equal(summary.deactivated, 1);
});
test('URA optional absent Product.user/archive actor and reserved bootstrap ID ignored', async () => {
    await db.collection('orders').insertOne({ user: owner, administrativeArchivedBy: null });
    await db.collection('products').insertOne({ reviews: [] }); await db.collection('adminmutationlocks').insertOne({ bootstrapUserId: new mongoose.Types.ObjectId() });
    await db.collection('adminauditevents').insertOne({ actorUserId: owner, targetType: 'USER', targetId: new mongoose.Types.ObjectId(), action: 'USER_DELETED' });
    assert.equal((await audit()).issues.length, 0);
});
for (const status of ['UNKNOWN', null]) test('URA malformed status ' + status + ' reported', async () => {
    await db.collection('users').insertOne({ accountStatus: status }); assert.ok((await audit()).issues.some(issue => issue.category === 'INVALID_ACCOUNT_STATUS'));
});
test('URA missing deactivation metadata reported', async () => { await db.collection('users').insertOne({ accountStatus: 'DEACTIVATED' }); assert.ok((await audit()).issues.some(issue => issue.category === 'INVALID_LIFECYCLE_METADATA')); });
test('URA active with leftover metadata reported', async () => { await db.collection('users').updateOne({ _id: owner }, { $set: { deactivatedBy: owner } }); assert.ok((await audit()).issues.some(issue => issue.category === 'INVALID_LIFECYCLE_METADATA')); });
test('URA invalid reference does not expose supplied string', async () => {
    await db.collection('addresses').insertOne({ user: 'PRIVATE_INVALID_REFERENCE' }); assert.ok((await audit()).issues.some(issue => issue.category === 'INVALID_USER_REFERENCE'));
    assert.doesNotMatch(logs.join(''), /PRIVATE_INVALID_REFERENCE/);
});
test('URA auditor is read only: exact snapshots and native write methods forbidden', async () => {
    await db.collection('addresses').insertOne({ user: new mongoose.Types.ObjectId() });
    const snapshot = async () => Promise.all(names.map(name => db.collection(name).find().toArray())); const before = await snapshot();
    const original = mongoose.connection.db.collection.bind(mongoose.connection.db);
    const readConnection = { db: { collection: name => {
        const collection = original(name);
        return { find: (...args) => collection.find(...args), findOne: (...args) => collection.findOne(...args) };
    } } };
    await auditUserReferences(readConnection, { write: () => {} }); assert.deepEqual(await snapshot(), before);
});
test('URA dedicated config profile accepts DB only without secrets', () => {
    const { loadConfig } = require('../backend/config/runtimeConfig');
    const config = loadConfig({ NODE_ENV: 'test', DB_URI: process.env.DB_URI }, { profile: 'users-audit' }); assert.equal(config.profile, 'users-audit'); assert.equal(config.jwt, undefined);
});
test('URA script has no mutation/repair flags or production delete bypass', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../backend/scripts/auditUserReferences.js'), 'utf8');
    assert.match(source, /autoCreate: false, autoIndex: false/); assert.doesNotMatch(source, /deleteMany|updateMany|insertOne|--repair|--force/);
});
