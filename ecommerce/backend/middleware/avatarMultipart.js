const fileUpload = require('express-fileupload');
const { MAX_AVATAR_BYTES, error } = require('../utils/mediaContract');
const parser = fileUpload({ useTempFiles: false, debug: false,
    // One sentinel byte lets exactly 5 MiB pass even with Busboy's >= limit semantics.
    limits: { fileSize: MAX_AVATAR_BYTES + 1, files: 2, fields: 1, fieldSize: 256, parts: 3 },
    abortOnLimit: true,
    limitHandler: (req, res, next) => next(error('AVATAR_FILE_TOO_LARGE', 413, 'A foto deve ter no máximo 5 MiB.')),
});
module.exports = (req, res, next) => {
    if (!req.is('multipart/form-data')) return next(error('AVATAR_MULTIPART_REQUIRED', 400, 'Envie um arquivo no campo avatar usando multipart/form-data.'));
    parser(req, res, err => {
        if (err) return next(err);
        const files = req.files || {}, file = files.avatar;
        if (Object.keys(req.body || {}).length || Object.keys(files).length !== 1 || !file || Array.isArray(file)) return next(error('AVATAR_FILE_REQUIRED', 400, 'Envie exatamente um arquivo no campo avatar, sem outros campos.'));
        if (file.truncated || file.size > MAX_AVATAR_BYTES) return next(error('AVATAR_FILE_TOO_LARGE', 413, 'A foto deve ter no máximo 5 MiB.'));
        req.avatarFile = { bytes: file.data, mime: file.mimetype }; next();
    });
};
