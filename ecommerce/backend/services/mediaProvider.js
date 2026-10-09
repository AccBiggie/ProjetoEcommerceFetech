const cloudinary = require('cloudinary').v2;
const { error, isManagedAvatarPublicId } = require('../utils/mediaContract');
function createCloudinaryMediaProvider(client = cloudinary) {
    return {
        uploadAvatar({ bytes, publicId, userId }) {
            if (!Buffer.isBuffer(bytes) || !isManagedAvatarPublicId(userId, publicId)) throw error('AVATAR_INVALID_INPUT', 400, 'Arquivo inválido.');
            return new Promise((resolve, reject) => {
                const stream = client.uploader.upload_stream({ public_id: publicId, resource_type: 'image', overwrite: false, timeout: 30000 },
                    (err, result) => err ? reject(error('MEDIA_UPLOAD_FAILED', 502, 'Não foi possível enviar a foto.')) : resolve(result));
                stream.on('error', () => reject(error('MEDIA_UPLOAD_FAILED', 502, 'Não foi possível enviar a foto.'))); stream.end(bytes);
            });
        },
        async destroyImage({ publicId, userId }) {
            if (!isManagedAvatarPublicId(userId, publicId)) throw error('MEDIA_UNMANAGED_ASSET', 409, 'Mídia fora do namespace gerenciado.');
            try {
                const result = await client.uploader.destroy(publicId, { resource_type: 'image', invalidate: true, timeout: 30000 });
                if (!['ok', 'not found'].includes(result?.result)) throw new Error();
                return result;
            } catch { throw error('MEDIA_DESTROY_FAILED', 502, 'Não foi possível remover a mídia.'); }
        },
    };
}
function getProvider() {
    const config = require('../config/runtimeConfig').getRuntimeConfig().cloudinary;
    if (!config.enabled) throw error('MEDIA_PROVIDER_UNAVAILABLE', 503, 'Envio de foto temporariamente indisponível.');
    return createCloudinaryMediaProvider();
}
module.exports = { getProvider, createCloudinaryMediaProvider };
