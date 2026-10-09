function createFakeMediaProvider() {
    const calls = [], assets = new Set();
    const fake = { calls, assets, uploadFailure: false, destroyFailure: false, response: null, beforeUpload: null,
        async uploadAvatar(input) {
            calls.push({ action: 'upload', ...input });
            if (fake.beforeUpload) await fake.beforeUpload(input);
            if (fake.uploadFailure) throw new Error('PRIVATE_PROVIDER_SECRET');
            assets.add(input.publicId);
            return fake.response ? fake.response(input) : { public_id: input.publicId, secure_url: 'https://example.test/' + input.publicId + '.png', resource_type: 'image' };
        },
        async destroyImage(input) {
            calls.push({ action: 'destroy', ...input });
            if (fake.destroyFailure) throw new Error('PRIVATE_PROVIDER_SECRET');
            const found = assets.delete(input.publicId); return { result: found ? 'ok' : 'not found' };
        },
    };
    return fake;
}
module.exports = { createFakeMediaProvider };
