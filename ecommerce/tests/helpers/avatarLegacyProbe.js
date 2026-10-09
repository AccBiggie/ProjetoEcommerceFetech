const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./observabilityHarness');
const cloud = require('cloudinary');
// Captured vulnerable behavior from HEAD 991b4a3; test-only historical replay.
async function legacyUpdate(body) {
 const image = await cloud.v2.uploader.upload(body.avatar, { folder: 'avatars', width: 150, crop: 'scale' });
 await h.User.updateOne({ _id: user._id }, { $set: { avatar: { public_id: image.public_id, url: image.secure_url } } });
 return { status: 200 };
}
let env, h, user, cookie, originalUpload, originalDestroy, calls = [];
before(async () => {
    env = await start(); h = env.h; user = await h.createUser(); cookie = await h.login(user);
    h.configure({ CLOUDINARY_NAME: 'fake', CLOUDINARY_API_KEY: 'fake', CLOUDINARY_API_SECRET: 'fake' });
    originalUpload = cloud.v2.uploader.upload; originalDestroy = cloud.v2.uploader.destroy;
    cloud.v2.uploader.upload = async input => { calls.push({ action: 'upload', input }); return { public_id: 'new-avatar', secure_url: 'https://example.test/new.png' }; };
    cloud.v2.uploader.destroy = async input => { calls.push({ action: 'destroy', input }); return { result: 'ok' }; };
});
after(async () => { cloud.v2.uploader.upload = originalUpload; cloud.v2.uploader.destroy = originalDestroy; if (env) await env.stop(); });
test('PRE-F018 remote URL chega ao provider pelo profile histórico', async () => {
    const input = 'https://example.test/not-an-image.txt';
    const r = await legacyUpdate({ avatar: input });
    assert.equal(calls[0].input, input);
    console.log(JSON.stringify({ probe: 'PRE_F018', input, status: r.status, providerCalled: true, providerArgument: calls[0].input }));
});
test('PRE-F019 substituição deixa asset antigo sem destroy/ledger', async () => {
    await h.User.updateOne({ _id: user._id }, { $set: { avatar: { public_id: 'old-avatar', url: 'https://example.test/old.png' } } }); calls = [];
    await legacyUpdate({ avatar: 'data:image/png;base64,AAAA' });
    assert.equal((await h.User.findById(user._id)).avatar.public_id, 'new-avatar'); assert.equal(calls.filter(c => c.action === 'destroy').length, 0);
    console.log(JSON.stringify({ probe: 'PRE_F019', oldPublicId: 'old-avatar', newPublicId: 'new-avatar', uploadCalls: 1, destroyOldCalls: 0, orphan: true }));
});
