const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { start, image, User, Intent, Task } = require('./helpers/mediaHarness');
const { MAX_AVATAR_BYTES, isManagedAvatarPublicId } = require('../backend/utils/mediaContract');
let t;
before(async () => { t = await start(); });
after(async () => { if (t) await t.stop(); });
beforeEach(async () => { t.fake.calls.length = 0; t.fake.response = null; await t.h.clearRateLimits(); });
for (const source of ['http://example.test/file.txt', 'https://example.test/a.jpg', 'ftp://example.test/a.png', 'file:///a.png', 'data:image/png;base64,AAAA']) test('MEDIA rejects old origin ' + source.split(':')[0], async () => {
    const before = (await User.findById(t.user._id)).avatar;
    for (const route of ['/me/update', '/me/avatar']) await t.h.request('PUT', route, { avatar: source }, t.cookie, 400);
    assert.equal(t.fake.calls.length, 0); assert.deepEqual((await User.findById(t.user._id)).avatar, before);
});
for (const field of ['avatarUrl', 'public_id', 'publicId', 'secure_url', 'avatarRevision']) test('MEDIA textual mass assignment rejects ' + field, async () => { await t.h.request('PUT', '/me/update', { [field]: 'spoof' }, t.cookie, 400); assert.equal(t.fake.calls.length, 0); });
test('MEDIA registration has no unauthenticated upload', async () => { await t.h.request('POST', '/register', { name: 'Fake User', email: 'fake@fixture.test', password: t.h.password, avatar: 'https://example.test/a.jpg' }, null, 400); assert.equal(t.fake.calls.length, 0); });
test('MEDIA zero/multiple/unexpected files or fields rejected before provider', async () => {
    await t.post(null, { expected: 400 });
    for (const field of ['avatar', 'other']) await t.post(await image(), { expected: 400, extra: form => form.append(field, new Blob(['text']), 'second.jpg') });
    await t.post(await image(), { expected: 400, extra: form => form.set('publicId', 'evil') }); assert.equal(t.fake.calls.length, 0);
});
for (const format of ['jpeg', 'png', 'webp']) test('MEDIA valid ' + format + ' is decoded before Buffer-only provider', async () => {
    const r = await t.post(await image(format), { mime: 'image/' + format, expected: 200 });
    const call = t.fake.calls.find(c => c.action === 'upload'); assert.ok(Buffer.isBuffer(call.bytes)); assert.ok(isManagedAvatarPublicId(t.user._id, call.publicId));
    assert.equal(r.result.user.avatar.public_id, call.publicId); assert.match(r.result.user.avatar.url, /^https:/); assert.equal(r.result.user.avatarRevision, undefined);
    assert.match(r.response.headers.get('cache-control'), /no-store/); assert.match(r.response.headers.get('x-request-id'), /^[a-f\d-]{36}$/);
});
for (const [mime, bytes] of [['image/svg+xml', '<svg/>'], ['image/gif', 'GIF89a'], ['image/jpeg', 'PRIVATE_FILE_SENTINEL'], ['image/png', 'PRIVATE_FILE_SENTINEL'], ['application/pdf', '%PDF-1.0']]) test('MEDIA rejects content ' + mime, async () => { await t.post(Buffer.from(bytes), { mime, name: 'fake.jpg', expected: 415 }); assert.equal(t.fake.calls.length, 0); });
test('MEDIA PNG declared as JPEG is rejected', async () => { await t.post(await image(), { mime: 'image/jpeg', expected: 415 }); assert.equal(t.fake.calls.length, 0); });
test('MEDIA truncated signatures are insufficient', async () => { for (const format of ['jpeg', 'png', 'webp']) await t.post((await image(format)).subarray(0, 16), { mime: 'image/' + format, expected: 415 }); assert.equal(t.fake.calls.length, 0); });
test('MEDIA exactly limit accepted; one byte over and huge body rejected 413', async () => {
    const jpeg = await image('jpeg'); await t.post(Buffer.concat([jpeg, Buffer.alloc(MAX_AVATAR_BYTES - jpeg.length)]), { mime: 'image/jpeg', expected: 200 });
    t.fake.calls.length = 0;
    for (const size of [MAX_AVATAR_BYTES + 1, MAX_AVATAR_BYTES * 2]) await t.post(Buffer.alloc(size), { expected: 413 }); assert.equal(t.fake.calls.length, 0);
});
test('MEDIA filename traversal does not control ID or logs', async () => {
    const { capture } = require('./helpers/observabilityHarness'); t.h.configure({ LOG_LEVEL: 'info' });
    try { const r = await capture(() => t.post(awaitImage, { name: '../../PRIVATE_FILENAME.jpg', mime: 'image/png', expected: 200 })); assert.ok(!r.output.includes('PRIVATE_FILENAME')); assert.ok(!r.result.result.user.avatar.public_id.includes('PRIVATE_FILENAME')); } finally { t.h.configure(); }
});
let awaitImage;
before(async () => { awaitImage = await image(); });
for (const response of ['http', 'wrongId', 'resource', 'empty']) test('MEDIA provider response ' + response + ' never attaches', async () => {
    const before = (await User.findById(t.user._id)).avatar.public_id;
    t.fake.response = input => response === 'empty' ? {} : { public_id: response === 'wrongId' ? 'evil' : input.publicId, secure_url: response === 'http' ? 'http://example.test/a.png' : 'https://example.test/a.png', resource_type: response === 'resource' ? 'raw' : 'image' };
    await t.post(await image(), { expected: 502 }); assert.equal((await User.findById(t.user._id)).avatar.public_id, before);
    assert.ok(await Intent.exists({ user: t.user._id }));
});
test('MEDIA adapter forces image/overwrite=false and rejects URL input', async () => {
    let options, received;
    const client = { uploader: { upload_stream(o, callback) { options = o; return new Writable({ write(chunk, encoding, done) { received = chunk; done(); }, final(done) { callback(null, { public_id: o.public_id, secure_url: 'https://example.test/x' }); done(); } }); } } };
    const provider = require('../backend/services/mediaProvider').createCloudinaryMediaProvider(client), publicId = require('../backend/utils/mediaContract').managedId(t.user._id);
    await provider.uploadAvatar({ bytes: await image(), publicId, userId: t.user._id }); assert.equal(options.resource_type, 'image'); assert.equal(options.overwrite, false); assert.ok(Buffer.isBuffer(received));
    assert.throws(() => provider.uploadAvatar({ bytes: 'https://example.test/a.png', publicId, userId: t.user._id }), /Arquivo inválido/);
});
test('MEDIA missing configuration returns 503 while textual profile works', async () => {
    t.boundary.getProvider = t.original;
    try { t.h.configure(); const r = await t.post(await image(), { expected: 503 }); assert.equal(r.result.code, 'MEDIA_PROVIDER_UNAVAILABLE'); await t.h.request('PUT', '/me/update', { name: 'Text Profile' }, t.cookie, 200); }
    finally { t.boundary.getProvider = () => t.fake; }
});
test('MEDIA auth/CSRF invalid runs before intent/provider', async () => {
    const count = await Intent.countDocuments();
    await t.post(await image(), { auth: null, expected: 401 }); await t.post(await image(), { headers: { 'X-Fetech-CSRF': '' }, expected: 403 }); await t.post(await image(), { headers: { Origin: 'https://evil.example' }, expected: 403 });
    assert.equal(await Intent.countDocuments(), count); assert.equal(t.fake.calls.length, 0);
});
test('MEDIA ledger contains no bytes, filename, URL, email or TTL', async () => {
    const r = await t.post(await image(), { expected: 200 }); const row = await Intent.findOne({ publicId: r.result.user.avatar.public_id }).lean();
    assert.ok(!JSON.stringify(row).includes(t.user.email)); assert.ok(!JSON.stringify(row).includes('https:')); assert.deepEqual(Object.keys(row).sort(), ['_id','createdAt','expectedAvatarRevision','failureCode','kind','provider','publicId','status','updatedAt','user'].sort());
    for (const model of [Intent, Task]) assert.ok((await model.listIndexes()).every(i => i.expireAfterSeconds === undefined));
});
test('MEDIA deactivated and stale JWT are rejected before parser/intent/provider', async () => {
    const other = await t.h.createUser(), cookie = await t.h.login(other), count = await Intent.countDocuments();
    await User.collection.updateOne({ _id: other._id }, { $set: { accountStatus: 'DEACTIVATED', tokenVersion: 1 } });
    await t.post(await image(), { auth: cookie, expected: 401 });
    await t.post(await image(), { auth: t.h.signedCookie(t.user, { tokenVersion: 999 }), expected: 401 });
    assert.equal(await Intent.countDocuments(), count); assert.equal(t.fake.calls.length, 0);
});
test('MEDIA distributed abuse guard limits attempts before parsing/provider', async () => {
    for (let i = 0; i < 10; i++) await t.post(Buffer.from('text'), { expected: 415 });
    const r = await t.post(await image(), { expected: 429 }); assert.ok(r.response.headers.get('retry-after')); assert.equal(t.fake.calls.length, 0);
});
