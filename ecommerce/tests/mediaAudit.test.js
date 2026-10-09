const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { start, User, Intent, Task, mongoose } = require('./helpers/mediaHarness');
const { auditMedia } = require('../backend/utils/mediaAudit');
const { managedId, GRACE_MS } = require('../backend/utils/mediaContract');
let t, db;
before(async () => { t = await start(); db = mongoose.connection.db; });
after(async () => { if (t) await t.stop(); });
beforeEach(async () => { await Intent.deleteMany({}); await Task.deleteMany({}); });
const audit = () => auditMedia(mongoose.connection, { write() {} });
test('MEDIA-AUD managed attached and default avatar have no false positives', async () => {
    const publicId = managedId(t.user._id); await User.updateOne({ _id: t.user._id }, { $set: { avatar: { public_id: publicId, url: 'https://example.test/x' } } }); await Intent.create({ user: t.user._id, publicId, status: 'ATTACHED', expectedAvatarRevision: 0 }); assert.deepEqual((await audit()).issues, []);
});
test('MEDIA-AUD unmanaged legacy, insecure URL and missing public ID are classified', async () => {
    const user = await t.h.createUser(); await User.collection.updateOne({ _id: user._id }, { $set: { avatar: { public_id: 'avatars/legacy', url: 'http://PRIVATE_URL/x' } } });
    await User.collection.updateOne({ _id: t.user._id }, { $set: { avatar: { url: 'http://PRIVATE_URL/y' } } });
    const report = await audit(); for (const code of ['AVATAR_REMOTE_OR_INSECURE_URL','AVATAR_PUBLIC_ID_OUTSIDE_MANAGED_NAMESPACE','LEGACY_UNTRACKED_AVATAR','USER_AVATAR_MISSING_PUBLIC_ID']) assert.ok(report.issues.some(r => r.code === code)); assert.ok(!JSON.stringify(report).includes('PRIVATE_URL'));
});
test('MEDIA-AUD shared asset detected without publicId/PII in output', async () => {
    const publicId = managedId(t.user._id), other = await t.h.createUser();
    await User.updateMany({ _id: { $in: [t.user._id, other._id] } }, { $set: { avatar: { public_id: publicId, url: 'https://PRIVATE_SENTINEL/x' } } });
    const report = await audit(); assert.ok(report.issues.some(r => r.code === 'AVATAR_PUBLIC_ID_SHARED')); assert.ok(!JSON.stringify(report).includes('PRIVATE_SENTINEL')); assert.ok(!JSON.stringify(report).includes(publicId));
});
test('MEDIA-AUD stale intent, dangling ATTACHED, pending and blocked cleanup detected', async () => {
    const p = managedId(t.user._id), stale = await Intent.create({ user: t.user._id, publicId: p, status: 'PREPARED', expectedAvatarRevision: 0 });
    await Intent.updateOne({ _id: stale._id }, { $set: { updatedAt: new Date(Date.now() - GRACE_MS - 1) } }, { timestamps: false });
    await Intent.create({ user: t.user._id, publicId: managedId(t.user._id), status: 'ATTACHED', expectedAvatarRevision: 0 });
    for (const status of ['PENDING','BLOCKED']) await Task.create({ user: t.user._id, publicId: managedId(t.user._id), status, reason: 'REPLACED_AVATAR' });
    const issues = (await audit()).issues; for (const code of ['MEDIA_UPLOAD_INTENT_STALE','MEDIA_INTENT_ATTACHED_BUT_NOT_REFERENCED','MEDIA_CLEANUP_PENDING','MEDIA_CLEANUP_BLOCKED']) assert.ok(issues.some(r => r.code === code));
});
async function snapshot() { const result = {}; for (const { name } of await db.listCollections().toArray()) result[name] = await db.collection(name).find().sort({ _id: 1 }).toArray(); return result; }
test('MEDIA-AUD exact snapshot unchanged and provider calls zero', async () => { const before = await snapshot(), n = t.fake.calls.length; await audit(); assert.deepEqual(await snapshot(), before); assert.equal(t.fake.calls.length, n); });
test('MEDIA-AUD minimal F036 profiles and partial Cloudinary fail-fast', () => {
    const { loadConfig } = require('../backend/config/runtimeConfig'); assert.equal(loadConfig({ DB_URI: process.env.DB_URI }, { profile: 'media-audit' }).profile, 'media-audit'); assert.equal(loadConfig({ DB_URI: process.env.DB_URI }, { profile: 'media-reconcile' }).cloudinary.enabled, false); assert.throws(() => loadConfig({ DB_URI: process.env.DB_URI, CLOUDINARY_NAME: 'partial' }, { profile: 'media-reconcile' }));
});

test('MEDIA-AUD CLI audit and reconcile default are read-only on temp DB', async () => {
    const before = await snapshot();
    async function run(script, args = []) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(__dirname, '../backend/scripts/' + script), ...args], { windowsHide: true, env: { ...process.env, DB_URI: process.env.DB_URI }, stdio: ['ignore','pipe','pipe'] }); let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); child.once('error', reject); child.once('exit', code => resolve({ code, output })); }); }
    assert.equal((await run('auditMedia.js')).code, 0); assert.equal((await run('reconcileMedia.js')).code, 0); assert.equal((await run('reconcileMedia.js', ['--apply'])).code, 1); assert.equal((await run('reconcileMedia.js', ['--apply','--confirm-db','wrong'])).code, 1); assert.deepEqual(await snapshot(), before);
});
test('MEDIA-AUD CLI apply exact temporary DB with injected fake cleans stale intent', async () => {
    const publicId = managedId(t.user._id), intent = await Intent.create({ user: t.user._id, publicId, status: 'PREPARED', expectedAvatarRevision: 0 });
    await Intent.updateOne({ _id: intent._id }, { $set: { updatedAt: new Date(Date.now() - GRACE_MS - 1) } }, { timestamps: false });
    const source = "const mongoose=require('mongoose');const name=new mongoose.mongo.MongoClient(process.env.DB_URI).options.dbName;if(!name.startsWith('fetech_routes_auth_'))process.exit(1);require('./backend/scripts/reconcileMedia').main(['--apply','--confirm-db',name],{provider:require('./tests/helpers/fakeMediaProvider').createFakeMediaProvider()}).then(code=>{process.exitCode=code;});";
    const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['-e', source], { cwd: path.join(__dirname, '..'), env: { ...process.env }, windowsHide: true, stdio: ['ignore','pipe','pipe'] }); let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); child.once('error', reject); child.once('exit', code => resolve({ code, output })); });
    assert.equal(result.code, 0); assert.match(result.output, /APPLY/); assert.equal((await Intent.findById(intent._id)).status, 'CLEANED');
});
