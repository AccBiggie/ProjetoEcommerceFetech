const ErrorHander = require('../utils/errorHander');

function getClearAuthCookieOptions(options) {
    const nodeEnv = options ? options.nodeEnv : require('./runtimeConfig').getRuntimeConfig().environment;
    return { httpOnly: true, sameSite: 'lax', secure: nodeEnv === 'production', path: '/' };
}
function getAuthCookieOptions(options) {
    const config = options ? null : require('./runtimeConfig').getRuntimeConfig();
    const { nodeEnv = config?.environment, cookieExpire = config?.cookie.expireDays, now = Date.now() } = options || {};
    const days = Number(cookieExpire), expires = new Date(now + days * 86400000);
    if (!['string', 'number'].includes(typeof cookieExpire) || !Number.isFinite(days) || days <= 0 ||
        !Number.isFinite(expires.getTime()) || expires.getTime() <= now) {
        throw new ErrorHander('Configuração COOKIE_EXPIRE inválida: informe uma duração positiva em dias.', 500);
    }
    return { ...getClearAuthCookieOptions({ nodeEnv }), expires };
}
function setAuthCookie(res, token) { return res.cookie('token', token, getAuthCookieOptions()); }
function clearAuthCookie(res) { return res.clearCookie('token', getClearAuthCookieOptions()); }
module.exports = { getAuthCookieOptions, getClearAuthCookieOptions, setAuthCookie, clearAuthCookie };
