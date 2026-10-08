const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
async function login(page, email) {
    await page.goto('/login?redirect=/account'); await page.locator('.loginForm input[type=email]').fill(email);
    await page.locator('.loginForm input[type=password]').fill(password);
    const reply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/login' && response.request().method() === 'POST');
    await page.locator('.loginForm button[type=submit]').click(); expect((await reply).status()).toBe(200);
    await expect(page).toHaveURL(url => url.pathname === '/account');
}
test('lifecycle: status/filtros, desativar revoga sessão, reativar exige login novo e audita', async ({ page, browser }) => {
    // Dedicated seeded fixture avoids sharing the suite's public registration quota.
    const email = 'lifecycle@routes.example.com';
    const customerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3300' });
    try {
        const customer = await customerContext.newPage();
        await login(customer, email);
        const response = await customerContext.request.get('/api/v1/me');
        expect(response.status()).toBe(200); const id = (await response.json()).user._id;
        await expect(customer.getByRole('heading', { name: 'Meu perfil', exact: true })).toBeVisible();
        await login(page, 'admin@routes.example.com'); await page.goto('/dashboard');
        await page.getByRole('tab', { name: 'Usuários', exact: true }).click();
        const filter = page.getByRole('combobox', { name: 'Filtrar usuários', exact: true }), row = page.getByRole('row').filter({ hasText: email });
        await expect(filter).toHaveValue('active'); await expect(row).toContainText('Ativo');
        await expect(row.getByRole('button', { name: 'Excluir', exact: true })).toHaveCount(0);
        await filter.selectOption('all'); await expect(row).toBeVisible();
        await row.getByRole('button', { name: 'Desativar conta', exact: true }).click();
        const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('histórico serão preservados');
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(row).toContainText('Ativo');
        await row.getByRole('button', { name: 'Desativar conta', exact: true }).click();
        const deactivation = page.waitForResponse(response => response.url().endsWith('/' + id + '/deactivate'));
        await dialog.getByRole('button', { name: 'Confirmar desativação', exact: true }).click();
        const deactivated = await deactivation; expect(deactivated.status()).toBe(200);
        expect((deactivated.headers()['cache-control'] || '').includes('no-store')).toBe(true);
        await expect(row).toContainText('Desativado');
        const denied = customer.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/addresses');
        await customer.getByRole('link', { name: 'Meus endereços', exact: true }).click();
        expect((await denied).status()).toBe(401); await expect(customer).toHaveURL(/\/login$/);
        await filter.selectOption('active'); await expect(row).toHaveCount(0);
        await filter.selectOption('deactivated'); await expect(row).toContainText('Desativado');
        await row.getByRole('button', { name: 'Reativar conta', exact: true }).click();
        const reactivation = page.waitForResponse(response => response.url().endsWith('/' + id + '/reactivate'));
        await dialog.getByRole('button', { name: 'Confirmar reativação', exact: true }).click(); expect((await reactivation).status()).toBe(200);
        await expect(row).toHaveCount(0); await filter.selectOption('active'); await expect(row).toContainText('Ativo');
        const replay = await customerContext.request.get('/api/v1/me'); expect(replay.status()).toBe(401);
        await login(customer, email); await expect(customer.getByRole('heading', { name: 'Meu perfil', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Auditoria', exact: true }).click();
        const search = page.getByRole('textbox', { name: 'Código de suporte (Request ID)' });
        for (const [response, action] of [[deactivated, 'USER_DEACTIVATED'], [await reactivation, 'USER_REACTIVATED']]) {
            await search.fill(response.headers()['x-request-id']); await page.getByRole('button', { name: 'Buscar eventos', exact: true }).click();
            await expect(page.getByRole('cell', { name: action, exact: true })).toBeVisible();
            await expect(page.getByRole('table', { name: 'Eventos de auditoria administrativa' })).not.toContainText(email);
        }
        // Assert the legacy HTTP contract from the same authenticated admin context.
        const legacy = await mutation(page, 'delete', '/api/v1/admin/user/' + id); expect(legacy.status()).toBe(405);
        expect(legacy.headers().allow).toBe('PATCH');
    } finally { await customerContext.close(); }
});
