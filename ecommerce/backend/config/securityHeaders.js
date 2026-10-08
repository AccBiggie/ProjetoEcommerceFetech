const helmet = require('helmet');
const apiDirectives = {
    'default-src': ["'none'"], 'base-uri': ["'none'"],
    'form-action': ["'none'"], 'frame-ancestors': ["'none'"],
};
// Política do build estático. F023 deverá reproduzi-la no host real.
const frontendDirectives = {
    'default-src': ["'self'"], 'base-uri': ["'self'"], 'object-src': ["'none'"],
    'frame-ancestors': ["'none'"], 'form-action': ["'self'"], 'script-src': ["'self'"],
    'script-src-attr': ["'none'"], 'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'], 'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"], 'manifest-src': ["'self'"],
};
function createSecurityHeaders(directives) {
    return helmet({
        contentSecurityPolicy: { useDefaults: false, directives },
        xFrameOptions: { action: 'deny' },
        xContentTypeOptions: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-origin' },
        crossOriginEmbedderPolicy: false,
        // HSTS e upgrade para HTTPS dependem do deployment real (F023).
        strictTransportSecurity: false,
    });
}
module.exports = { apiSecurityHeaders: () => createSecurityHeaders(apiDirectives),
    frontendSecurityHeaders: () => createSecurityHeaders(frontendDirectives) };
