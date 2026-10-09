const mongoose = require('mongoose');
const http = require('node:http');
async function main() {
    if (!new mongoose.mongo.MongoClient(process.env.DB_URI).options.dbName.startsWith('fetech_routes_auth_')) throw new Error('Test database required');
    require('../../backend/config/runtimeConfig').initializeConfig(process.env);
    await mongoose.connect(process.env.DB_URI);
    const provider = require('./fakeMediaProvider').createFakeMediaProvider(), mode = process.env.MEDIA_TEST_MODE;
    require('../../backend/services/mediaProvider').getProvider = () => provider;
    const gate = new Promise(resolve => process.on('message', msg => { if (msg === 'release') resolve(); }));
    if (mode === 'api') { provider.beforeUpload = async input => { process.send({ uploaded: true, publicId: input.publicId }); await gate; }; const server = http.createServer(require('../../backend/app')); server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port })); return; }
    if (mode === 'beforeAttach') provider.uploadAvatar = async input => { process.send({ crashWindow: true, publicId: input.publicId }); await gate; };
    if (mode === 'afterCommit') provider.destroyImage = async input => { const actor = await require('../../backend/models/userModel').findById(process.env.MEDIA_TEST_USER); process.send({ crashWindow: true, publicId: actor.avatar.public_id }); await gate; };
    const actor = await require('../../backend/models/userModel').findById(process.env.MEDIA_TEST_USER);
    const bytes = await require('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer();
    await require('../../backend/services/avatarMediaService').createAvatarMediaService({ provider }).replace({ actor, bytes });
}
main().catch(() => { process.send({ failed: true }); process.exit(1); });
