const sharp = require('sharp');
const { MAX_AVATAR_BYTES, error } = require('./mediaContract');
const formats = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
async function validateAvatarContent(bytes, declaredMime) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw error('AVATAR_FILE_REQUIRED', 400, 'Escolha um arquivo de imagem.');
    if (bytes.length > MAX_AVATAR_BYTES) throw error('AVATAR_FILE_TOO_LARGE', 413, 'A foto deve ter no máximo 5 MiB.');
    // Reject markup/other codecs before decoding. Full decode below is the authority.
    const signature = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
        : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
        : bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg' : null;
    const invalid = () => error('AVATAR_INVALID_TYPE', 415, 'Envie uma imagem JPEG, PNG ou WebP válida.');
    if (!signature || declaredMime !== formats[signature]) throw invalid();
    try {
        const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16 * 1024 * 1024 });
        const metadata = await image.metadata();
        if (metadata.format !== signature || metadata.pages > 1) throw invalid();
        // Force decoding of all pixels before resizing; headers alone cannot pass.
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
        return await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
            .resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    } catch { throw invalid(); }
}
module.exports = { validateAvatarContent };
