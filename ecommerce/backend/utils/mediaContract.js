const crypto = require('node:crypto');
const ErrorHander = require('./errorHander');
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const GRACE_MS = 15 * 60 * 1000;
const error = (code, status, message) => Object.assign(new ErrorHander(message, status), { code });
const managedId = user => `fetech/users/${user}/avatar/${crypto.randomUUID()}`;
const isManagedAvatarPublicId = (user, publicId) => /^[a-f\d]{24}$/i.test(String(user)) && typeof publicId === 'string' &&
    new RegExp(`^fetech/users/${user}/avatar/[a-f\\d]{8}-[a-f\\d]{4}-4[a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}$`, 'i').test(publicId);
const httpsUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
function rejectMediaFields(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw error('AVATAR_MULTIPART_REQUIRED', 400, 'Envie os dados do perfil como JSON.');
    if (['avatar', 'avatarUrl', 'public_id', 'publicId', 'secure_url', 'avatarRevision'].some(key => Object.hasOwn(body, key))) throw error('AVATAR_MULTIPART_REQUIRED', 400, 'Envie a foto pelo endpoint de avatar usando um arquivo.');
}
function providerResult(result, publicId) {
    if (!result || result.public_id !== publicId || !httpsUrl(result.secure_url) || result.resource_type !== undefined && result.resource_type !== 'image') throw error('MEDIA_PROVIDER_INVALID_RESPONSE', 502, 'Não foi possível validar o envio da foto.');
    return { public_id: publicId, url: result.secure_url };
}
module.exports = { MAX_AVATAR_BYTES, GRACE_MS, error, managedId, isManagedAvatarPublicId, httpsUrl, rejectMediaFields, providerResult };
