const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { audit } = require('../backend/utils/emailOutboxAudit');
const Model = require('../backend/models/emailOutboxModel');
const { createFakeEmailProvider } = require('./helpers/fakeEmailProvider');
let env, user, collection;
before(async () => { env = await require('./helpers/observabilityHarness').start(); await Model.init(); user = await env.h.createUser(); collection = Model.collection; });
beforeEach(async () => { await Model.deleteMany({}); });
after(async () => { await env?.stop(); });
const fixture = extra => ({ _id: new mongoose.Types.ObjectId(), schemaVersion: 1, eventType: 'ACCOUNT_REGISTERED', entityType: 'USER',
    entityId: user._id, recipientUserId: user._id, dedupeKey: 'ACCOUNT_REGISTERED:' + user.id + ':' + crypto.randomInt(1, 1e9),
    status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), leaseToken: null, leaseExpiresAt: null, sentAt: null, suppressedAt: null, ...extra });
async function inspect(extra) {
    await collection.insertOne(fixture(extra)); const lines = [];
    const result = await audit(mongoose.connection, { write: line => lines.push(line) }); return { ...result, output: lines.join('\n') };
}
for (const [label, fields, code, kind] of [
    ['stale processing', { status: 'PROCESSING', attempts: 1, leaseToken: crypto.randomUUID(), leaseExpiresAt: new Date(0) }, 'EMAIL_OUTBOX_STALE_PROCESSING', 'OPERATIONAL'],
    ['overdue retry', { status: 'RETRY', attempts: 1, nextAttemptAt: new Date(0) }, 'EMAIL_OUTBOX_OVERDUE_RETRY', 'OPERATIONAL'],
    ['dead letter', { status: 'DEAD', attempts: 6 }, 'EMAIL_OUTBOX_DEAD', 'OPERATIONAL'],
    ['unknown state', { status: 'FORGED' }, 'EMAIL_OUTBOX_INVALID_STATE', 'INTEGRITY'],
    ['missing sentAt', { status: 'SENT' }, 'EMAIL_OUTBOX_SENT_WITHOUT_SENT_AT', 'INTEGRITY'],
    ['missing User', { recipientUserId: new mongoose.Types.ObjectId() }, 'EMAIL_OUTBOX_MISSING_RECIPIENT_USER', 'INTEGRITY'],
    ['PII fields', { recipientEmail: 'PRIVATE_EMAIL_SENTINEL@example.test', html: 'PRIVATE_BODY_SENTINEL' }, 'EMAIL_OUTBOX_FORBIDDEN_CONTENT', 'INTEGRITY'],
]) test('MAIL audit detects ' + label, async () => { const result = await inspect(fields); assert.ok(result.issues.some(i => i.code === code && i.kind === kind)); assert.doesNotMatch(result.output, /PRIVATE_|@example/); });
test('MAIL audit pending anonymized recipient is operational finding', async () => {
    const disabled = await env.h.createUser(); await env.h.User.collection.updateOne({ _id: disabled._id }, { $set: { privacyStatus: 'ANONYMIZED' } });
    const result = await inspect({ recipientUserId: disabled._id }); assert.ok(result.issues.some(i => i.code === 'EMAIL_OUTBOX_PENDING_FOR_ANONYMIZED_USER'));
});
test('MAIL audit valid SENT and pending rows have no integrity findings', async () => {
    await collection.insertMany([fixture({ status: 'SENT', sentAt: new Date(), attempts: 1 }), fixture({ nextAttemptAt: new Date(Date.now() + 60000) })]);
    const result = await audit(mongoose.connection, { write: () => {} }); assert.deepEqual(result.issues, []); assert.equal(result.summary.retentionPeriod, 'UNDEFINED');
});
for (const [label, extra] of [['nextAttemptAt', { nextAttemptAt: 'PRIVATE_DATE_SENTINEL' }], ['leaseToken', { status: 'PROCESSING', leaseToken: 'PRIVATE_TOKEN_SENTINEL', leaseExpiresAt: new Date() }], ['suppressedAt', { status: 'SUPPRESSED' }], ['query operator reference', { recipientUserId: { $ne: null } }]]) test('MAIL audit rejects malformed ' + label, async () => {
    const result = await inspect(extra); assert.ok(result.issues.some(i => i.code === 'EMAIL_OUTBOX_INVALID_STATE')); assert.doesNotMatch(result.output, /PRIVATE_|\$ne/);
    if (label === 'query operator reference') assert.ok(result.issues.some(i => i.code === 'EMAIL_OUTBOX_MISSING_RECIPIENT_USER'));
});
test('MAIL audit preserves documents/indexes and makes zero provider calls', async context => {
    await collection.insertOne(fixture({ status: 'DEAD', attempts: 6 })); const fake = createFakeEmailProvider();
    context.mock.method(require('../backend/services/email/emailProvider'), 'getProvider', () => { throw new Error('Provider must not be initialized'); });
    const before = await collection.find().toArray(), users = await env.h.User.collection.find().toArray(), indexes = await collection.indexes();
    await audit(mongoose.connection, { write: () => {} }); assert.deepEqual(await collection.find().toArray(), before);
    assert.deepEqual(await env.h.User.collection.find().toArray(), users); assert.deepEqual(await collection.indexes(), indexes); assert.equal(fake.calls.length, 0);
});
function cli(script, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, '../backend/scripts/' + script + '.js'), ...args], { env: { ...process.env }, windowsHide: true });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', reject); child.once('exit', code => resolve({ code, output }));
    });
}
test('MAIL audit CLI is readonly in temporary database', async () => {
    await collection.insertOne(fixture({ status: 'DEAD' })); const before = await collection.find().toArray();
    const result = await cli('auditEmailOutbox'); assert.equal(result.code, 0); assert.match(result.output, /READ_ONLY/);
    assert.doesNotMatch(result.output, /PRIVATE_|@example/); assert.deepEqual(await collection.find().toArray(), before);
});
test('MAIL audit CLI rejects apply', async () => { assert.equal((await cli('auditEmailOutbox', ['--apply'])).code, 1); });
test('MAIL worker CLI defaults to dry-run without SMTP or writes', async () => {
    await collection.insertOne(fixture()); const before = await collection.find().toArray();
    const result = await cli('emailOutbox'); assert.equal(result.code, 0); assert.match(result.output, /DRY_RUN/); assert.deepEqual(await collection.find().toArray(), before);
});
for (const args of [['--apply'], ['--apply', '--confirm-db', 'wrong_database']]) test('MAIL CLI refuses incomplete/wrong confirmation ' + args.length, async () => {
    const before = await collection.find().toArray(); assert.equal((await cli('emailOutbox', args)).code, 1); assert.deepEqual(await collection.find().toArray(), before);
});
test('MAIL CLI applies only in fixture using injected fake provider', async () => {
    const fake = createFakeEmailProvider(); await collection.insertOne(fixture());
    const result = await require('../backend/scripts/emailOutbox').main(['--apply', '--confirm-db', env.h.database], {
        provider: fake, connection: mongoose.connection, connect: async () => {}, disconnect: async () => {},
    });
    assert.equal(result, 0); assert.equal(fake.calls.length, 1); assert.equal((await collection.findOne({})).status, 'SENT'); assert.equal(fake.closed, true);
});
