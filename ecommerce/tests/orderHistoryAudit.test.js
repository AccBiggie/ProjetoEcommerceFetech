const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { testUri } = require('./replicaSetHarness');
const { auditOrders } = require('../backend/utils/orderHistoryAudit');
const { loadConfig } = require('../backend/config/runtimeConfig');
const database = `fetech_history_audit_${process.pid}_${Date.now()}`;
before(() => mongoose.connect(testUri(database)));
after(async () => { if (mongoose.connection.name === database) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
test('HISTORY AUDIT READ_ONLY metadados, órfãos, reservas, sem PII ou escrita', async () => {
    const db = mongoose.connection.db, id = () => new mongoose.Types.ObjectId(), actor = id(), product = id();
    const records = [ { _id: id(), administrativeArchivedAt: new Date(), administrativeArchivedBy: actor }, { _id: id() },
        { _id: id(), administrativeArchivedAt: new Date() }, { _id: id(), administrativeArchivedAt: 'bad', administrativeArchivedBy: actor },
        { _id: id(), administrativeArchivedAt: new Date(), administrativeArchivedBy: 'bad' },
        { _id: id(), inventoryStatus: 'RESERVED', orderItems: [{ product }] } ];
    records.forEach(record => { record.shippingInfo = { address: 'PRIVATE_SENTINEL' }; record.idempotencyKeyHash = 'PRIVATE_HASH'; });
    await db.collection('orders').insertMany(records);
    await db.collection('orderidempotencies').insertMany([{ _id: id(), status: 'COMPLETED', order: id() }, { _id: id(), status: 'COMPLETED', order: records[0]._id }]);
    await db.collection('stockmovements').insertMany([{ _id: id(), order: id(), product, type: 'RESERVE' }, { _id: id(), order: records[0]._id, product, type: 'RESERVE' }]);
    const snapshot = async () => JSON.stringify(await Promise.all(['orders', 'orderidempotencies', 'stockmovements'].map(name => db.collection(name).find({}).toArray())));
    const before = await snapshot(), lines = [], result = await auditOrders(mongoose.connection, { write: line => lines.push(line) });
    assert.equal(await snapshot(), before); assert.equal(result.summary.mode, 'READ_ONLY'); assert.equal(result.summary.archived, 1);
    assert.equal(result.issues.filter(issue => issue.category === 'INVALID_ARCHIVE_METADATA').length, 3);
    for (const category of ['COMPLETED_WITHOUT_ORDER', 'ORPHAN_MOVEMENT', 'MISSING_RESERVE']) assert.equal(result.issues.filter(issue => issue.category === category).length, 1);
    assert.ok(!lines.join('').includes('PRIVATE')); assert.ok(!lines.join('').includes(String(actor)));
    assert.equal(loadConfig({ NODE_ENV: 'test', DB_URI: testUri(database) }, { profile: 'orders-audit' }).profile, 'orders-audit');
});
test('HISTORY AUDIT CLI real sem apply nem escrita no banco temporário', async () => {
    const spawn = require('node:child_process').spawnSync, script = require('node:path').resolve(__dirname, '../backend/scripts/auditOrders.js');
    const snapshot = async () => JSON.stringify(await mongoose.connection.db.collection('orders').find({}).toArray());
    const before = await snapshot();
    const reply = spawn(process.execPath, [script], { env: { ...process.env, NODE_ENV: 'test', DB_URI: testUri(database) }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(reply.status, 0); assert.ok(reply.stdout.includes('READ_ONLY')); assert.ok(!reply.stdout.includes('PRIVATE')); assert.equal(await snapshot(), before);
    const rejected = spawn(process.execPath, [script, '--apply'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(rejected.status, 1); assert.ok(rejected.stderr.includes('somente leitura')); assert.equal(await snapshot(), before);
});
