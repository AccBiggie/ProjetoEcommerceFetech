const mongoose = require('mongoose');
const sharp = require('sharp');
const User = require('../../backend/models/userModel');
const Intent = require('../../backend/models/mediaUploadIntentModel');
const Task = require('../../backend/models/mediaCleanupTaskModel');
const { createFakeMediaProvider } = require('./fakeMediaProvider');
async function image(format = 'png') { return sharp({ create: { width: 3, height: 3, channels: 3, background: '#334455' } }).toFormat(format).toBuffer(); }
async function start() {
    const env = await require('./observabilityHarness').start(), h = env.h;
    await Intent.init(); await Task.init();
    const fake = createFakeMediaProvider(), boundary = require('../../backend/services/mediaProvider'), original = boundary.getProvider;
    boundary.getProvider = () => fake;
    const user = await h.createUser(), cookie = await h.login(user);
    const post = async (bytes, { name = 'avatar.png', mime = 'image/png', auth = cookie, headers = {}, extra, expected } = {}) => {
        const form = new FormData(); if (bytes) form.append('avatar', new Blob([bytes], { type: mime }), name); if (extra) extra(form);
        const { withCsrf } = require('../httpHeaders');
        // h.request is intentionally JSON-only; infer its API address from a harmless reply.
        const me = await h.request('GET', '/me', null, cookie, 200);
        const url = new URL(me.response.url); url.pathname = '/api/v1/me/avatar';
        const response = await fetch(url, { method: 'PUT', headers: { ...withCsrf('PUT', headers), ...(auth ? { Cookie: auth } : {}) }, body: form });
        const result = await response.json();
        if (expected !== undefined) require('node:assert/strict').equal(response.status, expected);
        return { response, result, status: response.status };
    };
    return { ...env, h, user, cookie, fake, post, boundary, original, stop: async () => { boundary.getProvider = original; await env.stop(); } };
}
module.exports = { start, image, User, Intent, Task, mongoose };
