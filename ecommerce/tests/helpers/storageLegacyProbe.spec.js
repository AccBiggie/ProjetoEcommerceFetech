const { test, expect } = require('@playwright/test');
test('PRE F031 shippingInfo inválido impede bootstrap', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.name));
    await page.addInitScript(() => localStorage.setItem('shippingInfo', '{'));
    await page.goto('/'); await page.waitForTimeout(800);
    expect(errors).toContain('SyntaxError'); expect(await page.locator('#root').textContent()).toBe('');
    console.log(JSON.stringify({ probe: 'PRE_F031', key: 'shippingInfo', storage: 'localStorage', value: '{', exception: 'SyntaxError', blank: true }));
});
