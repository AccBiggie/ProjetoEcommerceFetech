const { testUri } = require('./replicaSetHarness');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { inspectShippingSnapshot, auditShippingSnapshots } = require('../backend/utils/shippingSnapshotAudit');
const { loadConfig } = require('../backend/config/runtimeConfig');
const database = `fetech_shipping_audit_${process.pid}_${Date.now()}`;
const uri = testUri(database);
const snapshot = () => ({ recipientName: 'PII_NAME_SENTINEL', address: 'PII_ADDRESS_SENTINEL', number: '10A', complement: '',
    neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' });
const document = (extra = {}) => ({ _id: new mongoose.Types.ObjectId(), shippingInfo: snapshot(), shippingInfoVersion: 2,
    email: 'PII_EMAIL_SENTINEL', paymentInfo: { id: 'PII_PAYMENT_SENTINEL' }, ...extra });
before(() => mongoose.connect(uri));
after(async () => { try { if (mongoose.connection.name === database && database.startsWith('fetech_shipping_audit_')) await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); } });
beforeEach(() => mongoose.connection.collection('orders').deleteMany({}));
for (const [name, doc, categories] of [
    ['current', document(), ['CURRENT_VALID']],
    ['legacy strings', document({ shippingInfoVersion: undefined }), ['LEGACY_VALID_STORED_VALUE']],
    ['numeric CEP', document({ shippingInfoVersion: 1, shippingInfo: { ...snapshot(), pinCode: 1234567 } }), ['LEGACY_NUMERIC_PINCODE']],
    ['numeric phone', document({ shippingInfoVersion: 1, shippingInfo: { ...snapshot(), phoneNo: 4123456789 } }), ['LEGACY_NUMERIC_PHONE']],
    ['missing', document({ shippingInfoVersion: 1, shippingInfo: { city: 'Curitiba' } }), ['LEGACY_MISSING_FIELDS']],
    ['invalid', document({ shippingInfoVersion: 1, shippingInfo: { ...snapshot(), city: ' ', pinCode: '12A45678' } }), ['LEGACY_INVALID_FORMAT']],
    ['invalid current', document({ shippingInfo: { ...snapshot(), pinCode: -1 } }), ['CURRENT_INVALID', 'LEGACY_NUMERIC_PINCODE']],
]) test(`AUDIT classificação ${name}`, () => { for (const c of categories) assert.ok(inspectShippingSnapshot(doc).categories.includes(c)); });
test('AUDIT banco temporário: resultado e documentos idênticos, sem PII', async () => {
    const collection = mongoose.connection.collection('orders');
    await collection.insertMany([document(), document({ shippingInfoVersion: 1, shippingInfo: { address: 'PII_ADDRESS_SENTINEL', pinCode: 1234567, phoneNo: 4123456789 } })]);
    const before = await collection.find().toArray(), logs = [];
    const summary = await auditShippingSnapshots(mongoose.connection, { write: line => logs.push(line) });
    assert.equal(summary.scanned, 2);
    assert.equal(summary.categories.CURRENT_VALID, 1);
    assert.equal(summary.categories.LEGACY_NUMERIC_PINCODE, 1);
    assert.equal(summary.categories.LEGACY_NUMERIC_PHONE, 1);
    assert.equal(summary.categories.LEGACY_MISSING_FIELDS, 1);
    assert.deepEqual(await collection.find().toArray(), before);
    for (const pii of ['PII_NAME_SENTINEL', 'PII_ADDRESS_SENTINEL', '01234567', '04123456789', '1234567', '4123456789', 'PII_EMAIL_SENTINEL', 'PII_PAYMENT_SENTINEL']) assert.equal(logs.join('\n').includes(pii), false);
    assert.match(logs[0], /READ ONLY/);
});
test('AUDIT somente find: nenhuma API de escrita disponível', async () => {
    const summary = await auditShippingSnapshots({ collection(name) { assert.equal(name, 'orders'); return { find: async function* () { yield document(); } }; } }, { write: () => {} });
    assert.equal(summary.scanned, 1);
});
test('AUDIT perfil mínimo F036 e fail-fast', () => {
    assert.equal(loadConfig({ NODE_ENV: 'test', DB_URI: uri }, { profile: 'shipping-audit' }).mongo.uri, uri);
    assert.throws(() => loadConfig({ NODE_ENV: 'test' }, { profile: 'shipping-audit' }));
});
test('AUDIT CLI real em subprocesso: leitura, zero alterações e sem apply', async () => {
    const collection = mongoose.connection.collection('orders');
    await collection.insertOne(document());
    const before = await collection.find().toArray();
    const env = { NODE_ENV: 'test', DB_URI: uri, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH };
    const run = (...args) => spawnSync(process.execPath, ['backend/scripts/auditShippingSnapshots.js', ...args], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 15000 });
    const reply = run();
    assert.equal(reply.status, 0);
    assert.match(reply.stdout, /READ ONLY/);
    assert.match(reply.stdout, /CURRENT_VALID/);
    assert.equal(reply.stdout.includes('PII_'), false);
    assert.deepEqual(await collection.find().toArray(), before);
    assert.equal(run('--apply').status, 1);
});
