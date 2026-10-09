const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const { start, image, User, Intent, Task, mongoose } = require('./helpers/mediaHarness');
const { createAvatarMediaService } = require('../backend/services/avatarMediaService');
const { managedId, GRACE_MS } = require('../backend/utils/mediaContract');
const { createFakeMediaProvider } = require('./helpers/fakeMediaProvider');
let t, bytes;
before(async () => { t = await start(); bytes = await image(); });
after(async () => { if (t) await t.stop(); });
async function fixture({ managed = true, legacyRevision = false } = {}) {
    const actor = await t.h.createUser(), old = managed ? managedId(actor._id) : 'old-avatar';
    await User.updateOne({ _id: actor._id }, { $set: { avatar: { public_id: old, url: managed ? 'https://example.test/old.png' : '/Profile.png' } } });
    if (legacyRevision) await User.collection.updateOne({ _id: actor._id }, { $unset: { avatarRevision: '' } });
    const fake = createFakeMediaProvider(); if (managed) fake.assets.add(old);
    const service = createAvatarMediaService({ provider: fake });
    const replace = () => service.replace({ actor, bytes });
    return { actor, old, fake, service, replace };
}
test('MEDIA intent exists PREPARED before provider and old is destroyed only after commit', async () => {
    const f = await fixture();
    f.fake.beforeUpload = async input => { const intent = await Intent.findOne({ publicId: input.publicId }); assert.equal(intent.status, 'PREPARED'); assert.equal((await User.findById(f.actor._id)).avatar.public_id, f.old); };
    const destroy = f.fake.destroyImage; f.fake.destroyImage = async input => { assert.notEqual((await User.findById(f.actor._id)).avatar.public_id, input.publicId); assert.ok(await Task.exists({ publicId: input.publicId })); return destroy(input); };
    const result = await f.replace(); assert.equal(result.avatarRevision, 1); assert.equal((await Intent.findOne({ publicId: result.avatar.public_id })).status, 'ATTACHED');
    assert.equal((await Task.findOne({ publicId: f.old })).status, 'COMPLETED'); assert.ok(f.fake.assets.has(result.avatar.public_id)); assert.ok(!f.fake.assets.has(f.old));
});
test('MEDIA legacy revision absent is effective zero without migration', async () => { const f = await fixture({ legacyRevision: true }); assert.equal((await f.replace()).avatarRevision, 1); });
test('MEDIA unmanaged/default old avatar is not destroyed', async () => { const f = await fixture({ managed: false }); await f.replace(); assert.equal(f.fake.calls.filter(c => c.action === 'destroy').length, 0); assert.equal(await Task.countDocuments({ publicId: f.old }), 0); });
test('MEDIA real unmanaged legacy replacement remains BLOCKED for human review', async () => {
    const f = await fixture({ managed: false }); await User.updateOne({ _id: f.actor._id }, { $set: { 'avatar.url': 'https://legacy.example.test/photo' } });
    await f.replace(); assert.equal(f.fake.calls.filter(c => c.action === 'destroy').length, 0); assert.equal((await Task.findOne({ publicId: f.old })).failureCode, 'LEGACY_UNMANAGED_AVATAR');
});
test('MEDIA destroy failure preserves successful User and durable pending cleanup', async () => {
    const f = await fixture(); f.fake.destroyFailure = true; const result = await f.replace(); const task = await Task.findOne({ publicId: f.old });
    assert.equal(task.status, 'PENDING'); assert.equal(task.attempts, 1); assert.equal((await User.findById(f.actor._id)).avatar.public_id, result.avatar.public_id);
    f.fake.destroyFailure = false; await f.service.cleanup(task._id); assert.equal((await Task.findById(task._id)).status, 'COMPLETED');
    const n = f.fake.calls.length; await f.service.cleanup(task._id); assert.equal(f.fake.calls.length, n);
});
test('MEDIA provider not-found is completed idempotently', async () => { const f = await fixture(); f.fake.assets.delete(f.old); await f.replace(); assert.equal((await Task.findOne({ publicId: f.old })).status, 'COMPLETED'); });
test('MEDIA cleanup task insert failure aborts attach and cleans new upload', async () => {
    const f = await fixture(), original = Task.findOneAndUpdate; let failed = false;
    try { Task.findOneAndUpdate = function (...args) { if (args[1].$setOnInsert.reason === 'REPLACED_AVATAR') { failed = true; throw new Error('DB failure'); } return original.apply(this, args); }; await assert.rejects(f.replace(), { statusCode: 502 }); }
    finally { Task.findOneAndUpdate = original; }
    assert.ok(failed); assert.equal((await User.findById(f.actor._id)).avatar.public_id, f.old); assert.equal((await User.findById(f.actor._id)).avatarRevision, 0);
    const intent = await Intent.findOne({ user: f.actor._id }); assert.equal(intent.status, 'CLEANED'); assert.ok(f.fake.assets.has(f.old)); assert.ok(!f.fake.assets.has(intent.publicId));
});
test('MEDIA attach DB failure and destroy failure leave new asset durably pending', async () => {
    const f = await fixture(), original = User.findOneAndUpdate; f.fake.destroyFailure = true;
    try { User.findOneAndUpdate = () => { throw new Error('DB attach failure'); }; await assert.rejects(f.replace(), { statusCode: 502 }); } finally { User.findOneAndUpdate = original; }
    assert.equal((await User.findById(f.actor._id)).avatar.public_id, f.old); const intent = await Intent.findOne({ user: f.actor._id });
    assert.equal((await Task.findOne({ publicId: intent.publicId })).status, 'PENDING'); f.fake.destroyFailure = false; await f.service.reconcile({ apply: true, write() {} }); assert.ok(!f.fake.assets.has(intent.publicId));
});
test('MEDIA DB completely unavailable after provider leaves PREPARED sufficient for recovery', async () => {
    const f = await fixture(), originalUpdate = Intent.updateOne, originalSession = mongoose.connection.startSession;
    f.fake.beforeUpload = async () => { Intent.updateOne = () => Promise.reject(new Error('DB unavailable')); mongoose.connection.startSession = () => Promise.reject(new Error('DB unavailable')); };
    try { await assert.rejects(f.replace(), { statusCode: 502 }); } finally { Intent.updateOne = originalUpdate; mongoose.connection.startSession = originalSession; }
    const intent = await Intent.findOne({ user: f.actor._id }); assert.equal(intent.status, 'PREPARED'); assert.equal((await User.findById(f.actor._id)).avatar.public_id, f.old);
    await Intent.updateOne({ _id: intent._id }, { $set: { updatedAt: new Date(Date.now() - GRACE_MS - 1) } }, { timestamps: false });
    await f.service.reconcile({ apply: true, write() {} }); assert.equal((await Intent.findById(intent._id)).status, 'CLEANED');
});
test('MEDIA ambiguous provider failure preserves old and reconciles predetermined ID', async () => {
    const f = await fixture(); f.fake.uploadAvatar = async input => { f.fake.assets.add(input.publicId); throw new Error('Ambiguous failure'); };
    await assert.rejects(f.replace(), { statusCode: 502 }); const intent = await Intent.findOne({ user: f.actor._id }); assert.equal(intent.status, 'PREPARED');
    const service = createAvatarMediaService({ provider: f.fake, now: () => Date.now() + GRACE_MS + 1 }); await service.reconcile({ apply: true, write() {} }); assert.ok(!f.fake.assets.has(intent.publicId));
});
for (const count of [2, 10]) test('MEDIA ' + count + ' concurrent replaces: one winner, all losers cleaned', async () => {
    const f = await fixture(); let n = 0, release; const gate = new Promise(resolve => { release = resolve; });
    f.fake.beforeUpload = async () => { if (++n === count) release(); await gate; };
    const results = await Promise.allSettled(Array.from({ length: count }, f.replace)); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'AVATAR_REPLACE_CONFLICT'));
    const current = await User.findById(f.actor._id); assert.equal(current.avatarRevision, 1); assert.deepEqual([...f.fake.assets], [current.avatar.public_id]);
    console.log(JSON.stringify({ probe: 'CONCURRENT_REPLACE', requests: count, winners: 1, conflicts: count - 1, winnerProtected: true }));
});
test('MEDIA independent Mongo connections preserve same CAS', async () => {
    const f = await fixture(), conn = await mongoose.createConnection(process.env.DB_URI).asPromise(); let n = 0, release; const gate = new Promise(resolve => { release = resolve; });
    f.fake.beforeUpload = async () => { if (++n === 2) release(); await gate; };
    try { const other = createAvatarMediaService({ connection: conn, provider: f.fake }); const r = await Promise.allSettled([f.replace(), other.replace({ actor: f.actor, bytes })]); assert.equal(r.filter(v => v.status === 'fulfilled').length, 1); assert.deepEqual([...f.fake.assets], [(await User.findById(f.actor._id)).avatar.public_id]); } finally { await conn.close(); }
});
for (const field of ['name', 'email']) test('MEDIA profile ' + field + ' and avatar concurrent preserve both', async () => {
    const f = await fixture(), cookie = await t.h.login(f.actor); let release, ready; const gate = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { ready = resolve; });
    f.fake.beforeUpload = async () => { ready(); await gate; }; const upload = f.replace(); await arrived;
    const value = field === 'name' ? 'Updated Text Name' : 'changed_' + f.actor.id + '@fixture.test'; await t.h.request('PUT', '/me/update', { [field]: value }, cookie, 200); release(); const result = await upload;
    const current = await User.findById(f.actor._id); assert.equal(current[field], value); assert.equal(current.avatar.public_id, result.avatar.public_id);
});
test('MEDIA deactivation during upload blocks attach, keeps old, cleans new', async () => {
    const f = await fixture(), admin = await t.h.createUser('admin'), cookie = await t.h.login(admin);
    f.fake.beforeUpload = async () => { await t.h.request('PATCH', '/admin/user/' + f.actor.id + '/deactivate', {}, cookie, 200); };
    await assert.rejects(f.replace(), { statusCode: 401 }); const current = await User.findById(f.actor._id); assert.equal(current.accountStatus, 'DEACTIVATED'); assert.equal(current.avatar.public_id, f.old); assert.ok(f.fake.assets.has(f.old));
});
test('MEDIA invalid avatarRevision fails closed', async () => { const f = await fixture(); await User.collection.updateOne({ _id: f.actor._id }, { $set: { avatarRevision: -1 } }); await assert.rejects(f.replace(), { code: 'AVATAR_REPLACE_CONFLICT' }); assert.equal(f.fake.calls.length, 0); });
test('MEDIA no API exposes ledger writes', async () => { for (const route of ['/media-upload-intents', '/media-cleanup-tasks']) for (const method of ['GET', 'POST', 'DELETE']) await t.h.request(method, route, method === 'GET' ? null : {}, t.cookie, 404); });
async function worker(mode, user) {
    const child = fork(path.join(__dirname, 'helpers/avatarWorker.js'), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, MEDIA_TEST_MODE: mode, MEDIA_TEST_USER: user.id } });
    const messages = [], listeners = [];
    child.on('message', message => { messages.push(message); for (const listener of listeners) listener(); });
    const wait = predicate => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Worker timeout')), 20000); const listener = () => { const found = messages.find(predicate); if (found) { clearTimeout(timer); resolve(found); } }; listeners.push(listener); listener(); });
    const stop = () => new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
    return { child, wait, stop };
}
for (const mode of ['beforeAttach', 'afterCommit']) test('MEDIA process crash ' + mode + ' remains reconciliable', async () => {
    const f = await fixture(), w = await worker(mode, f.actor);
    try { const message = await w.wait(m => m.crashWindow); if (message.publicId) f.fake.assets.add(message.publicId); await w.stop();
        const current = await User.findById(f.actor._id);
        if (mode === 'beforeAttach') { assert.equal(current.avatar.public_id, f.old); assert.equal((await Intent.findOne({ user: f.actor._id })).status, 'PREPARED'); }
        else { assert.notEqual(current.avatar.public_id, f.old); assert.equal((await Task.findOne({ publicId: f.old })).status, 'PENDING'); }
        await createAvatarMediaService({ provider: f.fake, now: () => Date.now() + GRACE_MS + 1000 }).reconcile({ apply: true, write() {} });
        if (mode === 'beforeAttach') assert.equal((await Intent.findOne({ user: f.actor._id })).status, 'CLEANED'); else assert.equal((await Task.findOne({ publicId: f.old })).status, 'COMPLETED');
    } finally { await w.stop(); }
});
test('MEDIA two API processes: CAS across instances', async () => {
    const f = await fixture(), a = await worker('api', f.actor), b = await worker('api', f.actor), cookie = await t.h.login(f.actor);
    try {
        const ports = await Promise.all([a.wait(m => m.port), b.wait(m => m.port)]);
        const upload = async port => { const form = new FormData(); form.set('avatar', new Blob([bytes], { type: 'image/png' }), 'a.png'); const response = await fetch(`http://127.0.0.1:${port}/api/v1/me/avatar`, { method: 'PUT', headers: { ...require('./httpHeaders').withCsrf('PUT'), Cookie: cookie }, body: form }); return response.status; };
        const requests = ports.map(v => upload(v.port)); await Promise.all([a.wait(m => m.uploaded), b.wait(m => m.uploaded)]); a.child.send('release'); b.child.send('release');
        assert.deepEqual((await Promise.all(requests)).sort(), [200, 409]); assert.equal((await User.findById(f.actor._id)).avatarRevision, 1);
    } finally { await a.stop(); await b.stop(); }
});
