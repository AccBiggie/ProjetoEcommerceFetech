const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { expectNoA11yViolations } = require('../helpers/accessibility');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
async function login(page, email) {
    await page.goto('/login?redirect=/account');
    await page.locator('.loginForm input[type=email]').fill(email); await page.locator('.loginForm input[type=password]').fill(password);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/login' && r.request().method() === 'POST');
    await page.locator('.loginForm button[type=submit]').click(); expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(url => url.pathname === '/account');
}
test('privacy: request, eligibility, strong confirmation, tombstone and audit through UI', async ({ page, browser }) => {
    const context = await browser.newContext({ baseURL: require('../helpers/e2eContext').context().origin });
    let productId;
    try {
        const customer = await context.newPage(); await login(customer, 'privacy@routes.example.com');
        const profile = (await (await context.request.get('/api/v1/me')).json()).user, id = profile._id;
        await customer.getByRole('link', { name: 'Privacidade', exact: true }).click();
        await expect(customer).toHaveURL(/\/account\/privacy$/);
        await expect(customer.getByText(/dados de entrega de pedidos/)).toBeVisible();
        await customer.getByRole('button', { name: 'Solicitar anonimização da conta', exact: true }).click();
        await expect(customer.getByRole('status')).toContainText('Solicitada');
        expect((await context.request.get('/api/v1/me')).status()).toBe(200);
        await login(page, 'admin@routes.example.com'); await page.goto('/dashboard');
        const created = await mutation(page, 'post', '/api/v1/product/new', { data: require('../fixtures').productData({ name: 'Privacy public review E2E', Stock: 0 }) });
        expect(created.status()).toBe(201); productId = (await created.json()).product._id;
        expect((await mutation(customer, 'put', '/api/v1/review', { data: { productId, rating: 5, comment: 'Privacy retained comment E2E' } })).status()).toBe(200);
        await page.getByRole('tab', { name: 'Privacidade', exact: true }).click();
        const row = page.getByRole('row').filter({ hasText: id });
        await expect(row.getByRole('button', { name: 'Anonimizar', exact: true })).toBeDisabled();
        expect((await mutation(page, 'patch', '/api/v1/admin/user/' + id + '/deactivate', { data: {} })).status()).toBe(200);
        await page.reload(); await page.getByRole('tab', { name: 'Privacidade', exact: true }).click();
        await row.getByRole('button', { name: 'Anonimizar', exact: true }).click();
        const dialog = page.getByRole('dialog'), confirm = dialog.getByRole('button', { name: 'Confirmar anonimização', exact: true });
        await expect(dialog).toContainText('irreversível'); await expect(confirm).toBeDisabled();
        await expect(dialog).toHaveAccessibleName('Anonimizar conta');
        await expect(dialog.getByLabel('Confirmação de anonimização')).toBeFocused();
        await expectNoA11yViolations(page, 'privacy irreversible confirmation');
        await dialog.getByLabel('Confirmação de anonimização').fill('SIM'); await expect(confirm).toBeDisabled();
        await dialog.getByLabel('Confirmação de anonimização').fill('ANONIMIZAR ' + id);
        const denied = route => route.fulfill({ status: 503, json: { success: false, message: 'Falha temporária de privacidade.' } });
        await page.route('**/api/v1/admin/privacy/requests/*/anonymize', denied);
        await confirm.click();
        await expect(dialog.getByRole('alert')).toContainText('Falha temporária de privacidade.');
        await expectNoA11yViolations(page, 'privacy confirmation API error');
        await page.unroute('**/api/v1/admin/privacy/requests/*/anonymize', denied);
        const completed = page.waitForResponse(r => r.url().endsWith('/anonymize') && r.request().method() === 'POST');
        await confirm.click(); expect((await completed).status()).toBe(200); await expect(dialog).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
        expect((await context.request.get('/api/v1/me')).status()).toBe(401);
        const deniedLogin = await mutation(customer, 'post', '/api/v1/login', { data: { email: profile.email, password } }); expect(deniedLogin.status()).toBe(401);
        await customer.goto('/product/' + productId);
        await expect(customer.getByText('Usuário removido', { exact: true })).toBeVisible();
        await expect(customer.getByText(profile.name, { exact: true })).toHaveCount(0);
        await expect(customer.getByText('Privacy retained comment E2E', { exact: true })).toBeVisible();
        const reactivate = await mutation(page, 'patch', '/api/v1/admin/user/' + id + '/reactivate', { data: {} });
        expect(reactivate.status()).toBe(409); expect((await reactivate.json()).code).toBe('USER_ANONYMIZED');
        await page.getByRole('tab', { name: 'Auditoria', exact: true }).click();
        await page.getByRole('textbox', { name: 'Código de suporte (Request ID)' }).fill((await completed).headers()['x-request-id']);
        await page.getByRole('button', { name: 'Buscar eventos', exact: true }).click();
        await expect(page.getByRole('cell', { name: 'USER_ANONYMIZED', exact: true })).toBeVisible();
        await expect(page.getByRole('table', { name: 'Eventos de auditoria administrativa' })).not.toContainText('privacy@routes.example.com');
    } finally {
        try { if (productId) expect((await mutation(page, 'delete', '/api/v1/product/' + productId)).status()).toBe(200); }
        finally { await context.close(); }
    }
});
test('privacy: cancel keeps account active and permits a new request without persistent cache', async ({ page }) => {
    await login(page, 'privacy-cancel@routes.example.com'); await page.goto('/account/privacy');
    await page.getByRole('button', { name: 'Solicitar anonimização da conta', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solicitada');
    await page.getByRole('button', { name: 'Cancelar solicitação', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Cancelada');
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);
    await page.reload(); await expect(page.getByRole('status')).toContainText('Cancelada');
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => /privacy/i.test(key)))).toBe(false);
});
