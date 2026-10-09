const { test, expect } = require('@playwright/test');
const { installSecurityChecks } = require('./securityChecks'); installSecurityChecks(test, expect);
for (const mode of ['', '?redux=1', '?bootstrap=1']) test(`recovery boundary production-like ${mode || 'render'}`, async ({ page }) => {
    await page.goto('/__test/boundary/index.html' + mode);
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar esta tela.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE_STACK_SENTINEL'); await expect(page.locator('body')).not.toContainText('Error:');
    const reload = page.getByRole('button', { name: 'Recarregar página', exact: true });
    if (mode.includes('bootstrap')) await expect(reload).toBeFocused();
    else await expect(page.getByRole('heading')).toBeFocused();
    await Promise.all([page.waitForEvent('framenavigated'), reload.click()]);
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar esta tela.' })).toBeVisible();
});
test('recovery boundary selective reset preserves F005, cart/draft, auth and never clear', async ({ page }) => {
    const attempt = { key: 'valid-order-key-123456789', fingerprint: 'a'.repeat(64) };
    await page.addInitScript(value => {
        window.__clearCalls = 0; Storage.prototype.clear = () => { window.__clearCalls++; };
        if (!sessionStorage.getItem('fixtureInitialized')) {
            sessionStorage.setItem('fixtureInitialized', '1'); sessionStorage.setItem('fetech.orderAttempt.v1', JSON.stringify(value)); localStorage.setItem('cartItems', '[]'); localStorage.setItem('shippingInfo', '{}'); localStorage.setItem('fetech-color-mode', 'dark'); localStorage.setItem('unknown', 'preserve');
        }
    }, attempt);
    await page.goto('/__test/boundary/index.html');
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('SecurityError'); }; });
    await Promise.all([page.waitForEvent('framenavigated'), page.getByRole('button', { name: 'Restaurar preferências da interface' }).click()]);
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar esta tela.' })).toBeVisible();
    const stored = await page.evaluate(() => ({ attempt: JSON.parse(sessionStorage.getItem('fetech.orderAttempt.v1')), cart: localStorage.getItem('cartItems'), shipping: localStorage.getItem('shippingInfo'), theme: localStorage.getItem('fetech-color-mode'), unknown: localStorage.getItem('unknown'), clear: window.__clearCalls }));
    expect(stored).toEqual({ attempt, cart: '[]', shipping: '{}', theme: null, unknown: 'preserve', clear: 0 });
});
