const { withCsrf } = require('../httpHeaders');
function mutation(page, method, url, options = {}) {
    return page.request[method](url, { ...options, headers: withCsrf(method, options.headers) });
}
function installSecurityChecks(test, expect) {
    const states = new WeakMap();
    test.beforeEach(async ({ page }) => {
        const state = { mutations: [], cspErrors: 0 }; states.set(page, state);
        await page.addInitScript(() => {
            window.__fetechCspViolations = [];
            document.addEventListener('securitypolicyviolation', event => {
                // Não registrar blockedURI: pode conter dados privados/token de reset.
                window.__fetechCspViolations.push(event.effectiveDirective);
            });
        });
        page.on('console', message => {
            if (message.type() === 'error' && /content security policy|violates.*directive/i.test(message.text())) state.cspErrors++;
        });
        page.on('request', request => {
            if (new URL(request.url()).pathname.startsWith('/api/v1/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
                const headers = request.headers();
                state.mutations.push(headers['x-fetech-csrf'] === '1' && !headers.authorization);
            }
        });
    });
    test.afterEach(async ({ page }) => {
        const state = states.get(page);
        expect(state.mutations.every(Boolean)).toBe(true);
        expect(state.cspErrors).toBe(0);
        expect(await page.evaluate(() => window.__fetechCspViolations || [])).toEqual([]);
    });
}
module.exports = { installSecurityChecks, mutation };
