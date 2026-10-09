const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures'); const { mutation, installSecurityChecks } = require('./securityChecks'); installSecurityChecks(test, expect);
for (const [key, raw] of [['cartItems', '{'], ['cartItems', '{"foo":"bar"}'], ['cartItems', 'null'], ['cartItems', '{"version":99,"data":[]}'], ['shippingInfo', '{'], ['shippingInfo', 'null'], ['fetech-color-mode', 'PRIVATE_THEME_SENTINEL']]) test(`storage bootstrap recovery ${key} ${raw}`, async ({ page }) => {
    const errors = [], logs = []; page.on('pageerror', e => errors.push(e.name)); page.on('console', m => logs.push(m.text()));
    await page.addInitScript(({ key, raw }) => {
        if (!sessionStorage.getItem('fixtureInitialized')) { localStorage.setItem(key, raw); localStorage.setItem('unknown', 'preserve'); sessionStorage.setItem('fixtureInitialized', '1'); }
        window.__clears = 0; Storage.prototype.clear = () => { window.__clears++; };
    }, { key, raw });
    await page.goto('/'); await expect(page.getByRole('banner')).toBeVisible(); await expect(page.locator('main')).toBeVisible(); await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => window.__clears)).toBe(0); expect(await page.evaluate(() => localStorage.getItem('unknown'))).toBe('preserve');
    await page.reload(); await expect(page.getByRole('banner')).toBeVisible(); expect(errors).toEqual([]); expect(logs.join(' ')).not.toContain('PRIVATE_THEME_SENTINEL');
});
async function checkout(page) {
    expect((await mutation(page, 'post', '/api/v1/login', { data: { email: 'media@routes.example.com', password } })).status()).toBe(200);
    await page.goto('/products'); await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).first().click();
    // SPA navigation preserves the in-memory cart when persistence is blocked.
    await page.getByRole('link', { name: 'Carrinho', exact: true }).click();
    await page.getByRole('button', { name: 'Finalizar pedido', exact: true }).click();
    for (const [name, value] of Object.entries({ 'Nome do destinatário': 'Fixture', Endereço: 'Rua', Número: '01A', Bairro: 'Centro', Cidade: 'Curitiba', Estado: 'PR', País: 'Brasil', CEP: '01234567', Telefone: '04123456789' })) await page.getByRole('textbox', { name, exact: true }).fill(value);
}
test('storage corrupt F005 no automatic order/new key; persists review across reload', async ({ page }) => {
    await page.goto('/'); await page.evaluate(() => sessionStorage.setItem('fetech.orderAttempt.v1', '{'));
    let posts = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/v1/order/new')) posts++; });
    await checkout(page); await expect(page.getByRole('button', { name: 'Criar pedido', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'Isso não significa' })).toBeVisible(); expect(posts).toBe(0);
    await page.reload(); await expect(page.getByRole('button', { name: 'Criar pedido', exact: true })).toBeDisabled(); expect(posts).toBe(0);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('fetech.orderAttempt.v1')))).toEqual({ recoveryRequired: true });
    page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'Já conferi meus pedidos; iniciar outra tentativa' }).click(); expect(posts).toBe(0);
    page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Já conferi meus pedidos; iniciar outra tentativa' }).click(); await expect(page.getByRole('button', { name: 'Criar pedido', exact: true })).toBeEnabled(); expect(posts).toBe(0);
});
for (const mode of ['getter', 'getItem', 'setItem']) test(`storage unavailable home usable/order blocked ${mode}`, async ({ page }) => {
    await page.addInitScript(mode => {
        window.__clears = 0; Storage.prototype.clear = () => { window.__clears++; };
        if (mode === 'getter') for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Denied', 'SecurityError'); } });
        else Storage.prototype[mode] = () => { throw new DOMException('Denied', mode === 'setItem' ? 'QuotaExceededError' : 'SecurityError'); };
    }, mode);
    const errors = []; page.on('pageerror', e => errors.push(e.name)); let posts = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/v1/order/new')) posts++; });
    await page.goto('/'); await expect(page.getByRole('banner')).toBeVisible(); await checkout(page);
    const button = page.getByRole('button', { name: 'Criar pedido', exact: true });
    if (mode === 'setItem') { await button.click(); await expect(page.getByRole('alert').filter({ hasText: 'preservar esta tentativa' })).toBeVisible(); }
    else await expect(button).toBeDisabled();
    expect(posts).toBe(0); expect(errors).toEqual([]); expect(await page.evaluate(() => window.__clears)).toBe(0);
});
test('storage fake JWT/user cache cannot authenticate and no auth storage is created', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('token', 'PRIVATE_FAKE_JWT'); localStorage.setItem('user', '{"role":"admin"}'); });
    await page.goto('/account'); await expect(page).toHaveURL(/\/login/); expect((await page.request.get('/api/v1/me')).status()).toBe(401);
    expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
});
