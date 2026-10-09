const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { auditPrivacy } = require('../backend/utils/privacyAudit');
const { registry } = require('../backend/utils/privacyDataRegistry');
const { spawn } = require('node:child_process');
const path = require('node:path');
let t, g;
before(async () => {
    t = await require('./helpers/privacyHarness').start(); g = await t.graph();
    const request = await t.request(g); await t.deactivate(g); await t.execute(g, request);
});
after(async () => { await t?.stop(); });
async function snapshot() {
    const result = {};
    for (const { name } of await t.db.listCollections().toArray()) result[name] = await t.db.collection(name).find({}).sort({ _id: 1 }).toArray();
    return result;
}
test('PRIV audit snapshot read-only preserves every collection and provider', async () => {
    const before = await snapshot(), calls = t.fake.calls.length, output = [];
    const result = await auditPrivacy(t.h.User.db, { write: line => output.push(line) });
    assert.equal(result.summary.mode, 'READ_ONLY'); assert.equal(result.summary.anonymized, 1);
    assert.equal(result.summary.historicalOrdersWithShipping, 1); assert.equal(result.summary.historicalRetention, 'UNDEFINED');
    assert.deepEqual(result.issues, []); assert.deepEqual(await snapshot(), before); assert.equal(t.fake.calls.length, calls);
    assert.doesNotMatch(output.join(''), /PERSON_|PRIVATE_AVATAR|13998765432|@example/);
});
const corruptions = [
    ['ANONYMIZED_USER_WITH_REAL_EMAIL', { email: 'PERSON_EMAIL_SENTINEL@example.test' }],
    ['ANONYMIZED_USER_WITH_REAL_NAME', { name: 'PERSON_NAME_SENTINEL' }],
    ['ANONYMIZED_USER_ACTIVE', { accountStatus: 'ACTIVE' }],
    ['ANONYMIZED_USER_WITH_RESET_TOKEN', { resetPasswordToken: 'PERSON_TOKEN_SENTINEL' }],
    ['ANONYMIZED_USER_WITH_MANAGED_AVATAR', { avatar: { public_id: g?.publicId || 'PERSON_AVATAR_SENTINEL', url: 'https://example.test/PERSON_AVATAR_SENTINEL' } }],
];
for (const [code, fields] of corruptions) test('PRIV audit detects ' + code + ' without printing personal values', async () => {
    // Deliberate corruption only in the runner-owned database, bypassing runtime guards.
    const users = t.db.collection('users'), original = await users.findOne({ _id: g.user._id });
    try {
        await users.updateOne({ _id: g.user._id }, { $set: fields }); const output = [];
        const result = await auditPrivacy(t.h.User.db, { write: line => output.push(line) });
        assert.ok(result.issues.some(row => row.code === code)); assert.doesNotMatch(output.join(''), /PERSON_|@example/);
    } finally { await users.replaceOne({ _id: g.user._id }, original); }
});
test('PRIV audit detects leftover Address and review name without leaking shipping/comment', async () => {
    const address = await t.db.collection('addresses').insertOne({ user: g.user._id, address: 'PERSON_ADDRESS_SENTINEL' });
    const product = await t.db.collection('products').findOne({ _id: g.product._id });
    try {
        await t.db.collection('products').updateOne({ _id: product._id }, { $set: { 'reviews.0.name': 'PERSON_NAME_SENTINEL' } });
        const output = [], result = await auditPrivacy(t.h.User.db, { write: line => output.push(line) });
        for (const code of ['ANONYMIZED_USER_WITH_ADDRESS', 'ANONYMIZED_USER_REVIEW_NAME']) assert.ok(result.issues.some(row => row.code === code));
        assert.doesNotMatch(output.join(''), /PERSON_|Comentário/);
    } finally { await t.db.collection('addresses').deleteOne({ _id: address.insertedId }); await t.db.collection('products').replaceOne({ _id: product._id }, product); }
});
test('PRIV audit inconsistent completed request is metadata only', async () => {
    const requests = t.db.collection('privacyrequests'), original = await requests.findOne({ user: g.user._id });
    try { await requests.updateOne({ _id: original._id }, { $unset: { completedAt: 1 } }); const result = await auditPrivacy(t.h.User.db, { write: () => {} }); assert.ok(result.issues.some(row => row.code === 'PRIVACY_REQUEST_INCONSISTENT')); }
    finally { await requests.replaceOne({ _id: original._id }, original); }
});
test('PRIV audit reports expired security bucket and leaves active HMAC buckets intact', async () => {
    const buckets = t.db.collection('authratelimits'), before = await buckets.find({}).toArray();
    await buckets.insertOne({ _id: 'EXPIRED_PRIVATE_HMAC_SENTINEL', scope: 'login', count: 1, pending: 0, windowStartedAt: new Date(), expiresAt: new Date(Date.now() - 1000) });
    try {
        const output = [], result = await auditPrivacy(t.h.User.db, { write: line => output.push(line) });
        assert.ok(result.issues.some(row => row.code === 'EXPIRED_SECURITY_RATE_LIMIT_RECORD' && row.id === null));
        assert.doesNotMatch(output.join(''), /HMAC_SENTINEL/);
        for (const row of before) assert.deepEqual(await buckets.findOne({ _id: row._id }), row);
        assert.ok((await buckets.indexes()).some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    } finally { await buckets.deleteOne({ _id: 'EXPIRED_PRIVATE_HMAC_SENTINEL' }); }
});
test('PRIV registry states undefined policy and preserves uncertain commercial attempt', () => {
    for (const store of ['User', 'Address', 'Order', 'PrivacyRequest', 'AuthRateLimit', 'AdminAuditEvent', 'StockMovement', 'OrderIdempotency']) assert.ok(registry.some(row => row.store === store));
    assert.ok(registry.every(row => row.retentionPeriod === 'UNDEFINED'));
    assert.equal(registry.find(row => row.store === 'localStorage/sessionStorage').anonymization, 'PRESERVE_UNCERTAIN_ATTEMPT');
});
test('PRIV CLI minimal F036 config is read-only and rejects --apply before connecting', async () => {
    const { loadConfig } = require('../backend/config/runtimeConfig');
    const { testUri } = require('./replicaSetHarness');
    const uri = testUri(t.h.database);
    assert.equal(loadConfig({ NODE_ENV: 'test', DB_URI: uri }, { profile: 'privacy-audit' }).profile, 'privacy-audit');
    const run = args => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, '../backend/scripts/auditPrivacy.js'), ...args], {
            env: { ...process.env, DB_URI: uri, NODE_ENV: 'test', JWT_SECRET: '', HOST: '', PORTEMAIL: '', USER: '', PASSWORD: '', EMAIL_SECURE: '', CLOUDINARY_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' },
        });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.on('error', reject); child.on('close', code => resolve({ code, output }));
    });
    const before = await snapshot(), report = await run([]); assert.equal(report.code, 0); assert.match(report.output, /READ_ONLY/);
    assert.doesNotMatch(report.output, /PERSON_|PRIVATE_AVATAR/); assert.deepEqual(await snapshot(), before);
    const rejected = await run(['--apply']); assert.equal(rejected.code, 1); assert.doesNotMatch(rejected.output, /mongodb|PERSON_/); assert.deepEqual(await snapshot(), before);
});
