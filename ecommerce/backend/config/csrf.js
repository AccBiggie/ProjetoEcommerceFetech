function getAllowedOrigins(options) {
    if (!options) return new Set(require('./runtimeConfig').getRuntimeConfig().frontend.allowedOrigins);
    const { nodeEnv, frontendUrl } = options;
    const production = nodeEnv === 'production';
    const origins = new Set(production ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']);
    if (frontendUrl !== undefined) {
        try {
            if (typeof frontendUrl !== 'string' || !/^https?:\/\//i.test(frontendUrl)) throw new Error();
            const url = new URL(frontendUrl);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
                frontendUrl.includes('*') || /[\s\\]/.test(frontendUrl) || (production && url.protocol !== 'https:')) throw new Error();
            origins.add(url.origin);
        } catch {
            throw new Error('FRONTEND_URL inválida para a política CSRF; use URL absoluta sem credenciais e HTTPS em production.');
        }
    } else if (production) {
        throw new Error('FRONTEND_URL é obrigatória em production para a política CSRF.');
    }
    return origins;
}
module.exports = { getAllowedOrigins };
