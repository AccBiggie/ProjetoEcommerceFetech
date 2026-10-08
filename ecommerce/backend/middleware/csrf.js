const { getAllowedOrigins } = require('../config/csrf');
const setNoStore = require('../utils/privateResponse');
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function parseOrigin(value, referer = false) {
    try {
        if (!value || !/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
            (!referer && (url.pathname !== '/' || url.search || url.hash))) return null;
        return url.origin;
    } catch { return null; }
}
module.exports = function createCsrfProtection(options) {
    const allowedOrigins = getAllowedOrigins(options);
    return (req, res, next) => {
        if (!unsafeMethods.has(req.method)) return next();
        const origin = req.get('Origin'), referer = req.get('Referer'), site = req.get('Sec-Fetch-Site');
        const source = origin !== undefined ? parseOrigin(origin) : referer !== undefined ? parseOrigin(referer, true) : undefined;
        if (req.get('X-Fetech-CSRF') !== '1' ||
            (source !== undefined && !allowedOrigins.has(source)) ||
            (site !== undefined && !['same-origin', 'none'].includes(site))) {
            setNoStore(res);
            return res.status(403).json({ success: false, message: 'Requisição não autorizada.' });
        }
        next();
    };
};
