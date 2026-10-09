const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, User, Intent, Task, mongoose } = require('./helpers/mediaHarness');
const { createAvatarMediaService } = require('../backend/services/avatarMediaService');
const { createFakeMediaProvider } = require('./helpers/fakeMediaProvider');
const { managedId, GRACE_MS } = require('../backend/utils/mediaContract');
const { options } = require('../backend/scripts/reconcileMedia');
let t;
before(async () => { t = await start(); });
after(async () => { if (t) await t.stop(); });
async function fixture(status = 'PREPARED', stale = true) {
    const user = await t.h.createUser(), publicId = managedId(user._id), fake = createFakeMediaProvider(); fake.assets.add(publicId);
    const intent = await Intent.create({ user: user._id, publicId, expectedAvatarRevision: 0, status });
    if (stale) await Intent.updateOne({ _id: intent._id }, { $set: { updatedAt: new Date(Date.now() - GRACE_MS - 1000) } }, { timestamps: false });
    return { user, publicId, fake, intent, service: createAvatarMediaService({ provider: fake }) };
}
for (const status of ['PREPARED', 'UPLOADED', 'FAILED', 'CLEANING']) test('MEDIA stale ' + status + ' without reference is cleaned', async () => {
    const f = await fixture(status); await f.service.reconcile({ apply: true, write() {} }); assert.equal((await Intent.findById(f.intent._id)).status, 'CLEANED'); assert.ok(!f.fake.assets.has(f.publicId));
});
for (const status of ['PREPARED', 'UPLOADED']) test('MEDIA stale referenced ' + status + ' reconciles ATTACHED, never destroys', async () => {
    const f = await fixture(status); await User.updateOne({ _id: f.user._id }, { $set: { avatar: { public_id: f.publicId, url: 'https://example.test/x' } } });
    await f.service.reconcile({ apply: true, write() {} }); assert.equal((await Intent.findById(f.intent._id)).status, 'ATTACHED'); assert.equal(f.fake.calls.length, 0);
});
test('MEDIA grace prevents cleanup of fresh upload intents', async () => {
    const f = await fixture('PREPARED', false); await f.service.reconcile({ apply: true, write() {} }); assert.equal(f.fake.calls.length, 0);
    const task = await Task.create({ user: f.user._id, publicId: f.publicId, reason: 'UNATTACHED_UPLOAD' }); await f.service.cleanup(task._id); assert.equal(f.fake.calls.length, 0); assert.equal((await Task.findById(task._id)).failureCode, 'MEDIA_UPLOAD_IN_PROGRESS');
});
test('MEDIA task for current asset is BLOCKED and winner protected', async () => {
    const f = await fixture('ATTACHED'); await User.updateOne({ _id: f.user._id }, { $set: { 'avatar.public_id': f.publicId } });
    const task = await Task.create({ user: f.user._id, publicId: f.publicId, reason: 'REPLACED_AVATAR' }); await f.service.cleanup(task._id);
    assert.equal((await Task.findById(task._id)).status, 'BLOCKED'); assert.equal(f.fake.calls.length, 0); assert.equal((await Intent.findById(f.intent._id)).status, 'ATTACHED');
});
test('MEDIA shared asset referenced by other/deactivated User is never destroyed', async () => {
    const f = await fixture('ATTACHED'), other = await t.h.createUser();
    await User.collection.updateOne({ _id: other._id }, { $set: { 'avatar.public_id': f.publicId, accountStatus: 'DEACTIVATED' } });
    const task = await Task.create({ user: f.user._id, publicId: f.publicId, reason: 'REPLACED_AVATAR' }); await f.service.cleanup(task._id); assert.equal(f.fake.calls.length, 0); assert.equal((await Task.findById(task._id)).failureCode, 'STILL_REFERENCED');
});
test('MEDIA unmanaged task fails closed despite persisted obligation', async () => {
    const f = await fixture(), task = await Task.create({ user: f.user._id, publicId: 'avatars/legacy', reason: 'REPLACED_AVATAR' });
    await f.service.cleanup(task._id); assert.equal((await Task.findById(task._id)).status, 'BLOCKED'); assert.equal(f.fake.calls.length, 0);
});
test('MEDIA dry-run does not change documents or invoke provider', async () => {
    const f = await fixture(), task = await Task.create({ user: f.user._id, publicId: f.publicId, reason: 'UNATTACHED_UPLOAD' });
    const before = await Intent.findById(f.intent._id).lean(), oldTask = await Task.findById(task._id).lean();
    const output = []; const report = await f.service.reconcile({ write: line => output.push(line) }); assert.equal(report.mode, 'DRY_RUN'); assert.equal(f.fake.calls.length, 0);
    assert.deepEqual(await Intent.findById(f.intent._id).lean(), before); assert.deepEqual(await Task.findById(task._id).lean(), oldTask); assert.ok(!output.join('').includes(f.user.email)); assert.ok(!output.join('').includes(f.publicId));
});
test('MEDIA CLI exact database confirmation required before connect/provider', () => {
    assert.deepEqual(options([], 'fixture'), { apply: false });
    for (const args of [['--apply'], ['--apply','--confirm-db','wrong'], ['--apply','--confirm-db','fixture','extra']]) assert.throws(() => options(args, 'fixture'));
    assert.deepEqual(options(['--apply','--confirm-db','fixture'], 'fixture'), { apply: true });
});
test('MEDIA no TTL and cleanup unique provider/publicId', async () => {
    const f = await fixture(), body = { user: f.user._id, publicId: f.publicId, reason: 'UNATTACHED_UPLOAD' };
    await Task.create(body); await assert.rejects(Task.create(body), err => err.code === 11000);
    assert.ok((await Task.listIndexes()).every(i => i.expireAfterSeconds === undefined));
});
test('MEDIA cleanup fence prevents delayed upload from attaching', async () => {
    const f = await fixture('UPLOADED'), task = await Task.create({ user: f.user._id, publicId: f.publicId, reason: 'UNATTACHED_UPLOAD' });
    const destroy = f.fake.destroyImage; f.fake.destroyImage = async input => { assert.equal((await Intent.findById(f.intent._id)).status, 'CLEANING'); return destroy(input); };
    await f.service.cleanup(task._id); assert.equal((await Intent.findById(f.intent._id)).status, 'CLEANED');
});
test('MEDIA completed task can be reopened for an asset created by delayed provider response', async () => {
    const f = await fixture(); await f.service.reconcile({ apply: true, write() {} }); f.fake.assets.add(f.publicId);
    await Intent.updateOne({ _id: f.intent._id }, { $set: { status: 'CLEANING', updatedAt: new Date(Date.now() - GRACE_MS - 1) } }, { timestamps: false });
    await f.service.reconcile({ apply: true, write() {} }); assert.ok(!f.fake.assets.has(f.publicId));
});
