const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ErrorHander = require('./errorHander');

const invalidSession = () => new ErrorHander('Sessão inválida ou expirada. Entre novamente.', 401);
const isValidVersion = version => Number.isSafeInteger(version) && version >= 0 && version < Number.MAX_SAFE_INTEGER;

function decodeSession(token) {
    if (typeof token !== 'string' || !token) return null;
    let decoded;
    try { decoded = jwt.verify(token, require('../config/runtimeConfig').getRuntimeConfig().jwt.secret); }
    catch (error) {
        if (error instanceof jwt.JsonWebTokenError) return null;
        throw error;
    }
    if (!decoded || typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id) ||
        !isValidVersion(decoded.tokenVersion)) return null;
    return decoded;
}

function versionFilter(version) {
    // O default hidratado é zero; documentos legados ainda podem não ter o campo no MongoDB.
    return version === 0
        ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
        : { tokenVersion: version };
}

async function saveWithRevokedSessions(user) {
    const version = user.tokenVersion;
    if (!isValidVersion(version)) throw invalidSession();
    // Evita que um save iniciado antes de outra revogação restaure uma versão antiga.
    user.$where = { ...user.$where, ...versionFilter(version) };
    user.tokenVersion = version + 1;
    try { await user.save(); }
    catch (error) {
        if (error.name === 'DocumentNotFoundError') throw invalidSession();
        throw error;
    }
}

module.exports = { decodeSession, versionFilter, saveWithRevokedSessions, isValidVersion, invalidSession };
