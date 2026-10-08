const { test, expect } = require('@playwright/test');
const path = require('node:path');
require('./securityChecks').installSecurityChecks(test, expect);
function directives(value) {
    return Object.fromEntries(value.split(';').filter(Boolean).map(item => {
        const [key, ...values] = item.trim().split(/\s+/); return [key, values];
    }));
}
test('host do build: CSP restritiva, headers e estilos Emotion funcionais', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers(), csp = directives(headers['content-security-policy']);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['connect-src']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp['img-src']).toContain('https:');
    expect(csp['img-src']).not.toContain('http:');
    expect(headers['strict-transport-security']).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Compre por departamento' })).toBeVisible();
    expect(await page.evaluate(() => document.querySelectorAll('style[data-emotion]').length > 0)).toBe(true);
});
test('CSP permite imagem HTTPS de produto e chamadas API same-origin', async ({ page, request }) => {
    const response = await request.get('/api/v1/products');
    expect(response.status()).toBe(200);
    const id = (await response.json()).products[0]._id;
    const imageUrl = 'https://images.example.test/fetech-fixture.png';
    // Fixture HTTPS sem serviço externo; nenhuma alteração no produto persistido.
    await page.route(imageUrl, route => route.fulfill({ path: path.join(__dirname, '../../frontend/public/Profile.png'), contentType: 'image/png' }));
    await page.route('**/api/v1/product/' + id, async route => {
        const upstream = await route.fetch(), body = await upstream.json();
        body.product.images[0].url = imageUrl;
        await route.fulfill({ response: upstream, json: body });
    });
    await page.goto('/product/' + id);
    const fixtureImage = page.locator('img[src="' + imageUrl + '"]').first();
    await expect(fixtureImage).toBeVisible();
    await expect.poll(() => fixtureImage.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
});
