const { test, expect } = require('@playwright/test');
const { password, productData } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
async function login(page, email) {
    await page.goto('/login?redirect=/account');
    await page.locator('.loginForm input[type=email]').fill(email);
    await page.locator('.loginForm input[type=password]').fill(password);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/login' && r.request().method() === 'POST');
    await page.locator('.loginForm button[type=submit]').click(); expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(url => url.pathname === '/account');
}
test('reviews: criação, atualização e segundo usuário exibem agregados do backend', async ({ page, browser }) => {
    await login(page, 'admin@routes.example.com');
    const created = await mutation(page, 'post', '/api/v1/product/new', { data: productData({ name: 'Produto E2E Reviews', Stock: 0 }) });
    expect(created.status()).toBe(201); const id = (await created.json()).product._id;
    const adminContext = await browser.newContext({ baseURL: require('../helpers/e2eContext').context().origin, storageState: await page.context().storageState() });
    const context = await browser.newContext({ baseURL: require('../helpers/e2eContext').context().origin });
    try {
        const customer = await context.newPage(); await login(customer, 'reviews-a@routes.example.com'); await customer.goto('/product/' + id);
        const send = async (rating, comment) => {
            await customer.getByLabel('Nota', { exact: true }).selectOption(String(rating));
            await customer.getByRole('textbox', { name: /^Comentário/ }).fill(comment);
            const response = customer.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/review' && r.request().method() === 'PUT');
            await customer.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
            const reply = await response; expect(reply.status()).toBe(200); return (await reply.json()).product;
        };
        const initial = await send(1, 'Avaliação inicial E2E'); await expect(customer.getByText('1 avaliações', { exact: true })).toBeVisible();
        const updated = await send(5, 'Avaliação atualizada E2E'); expect(updated.reviews[0]._id).toBe(initial.reviews[0]._id); expect(updated.numOfReviews).toBe(1); expect(updated.ratings).toBe(5);
        await expect(customer.getByText('Avaliação atualizada E2E', { exact: true })).toBeVisible(); await expect(customer.getByText('1 avaliações', { exact: true })).toBeVisible();
        await page.context().clearCookies();
        await login(page, 'reviews-b@routes.example.com'); await page.goto('/product/' + id);
        await page.getByLabel('Nota', { exact: true }).selectOption('1'); await page.getByRole('textbox', { name: /^Comentário/ }).fill('Segundo usuário E2E');
        const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/review' && r.request().method() === 'PUT');
        await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click(); const snapshot = (await (await response).json()).product;
        expect(snapshot.numOfReviews).toBe(2); expect(snapshot.ratings).toBe(3);
        await expect(page.getByText('2 avaliações', { exact: true })).toBeVisible(); await expect(page.getByRole('img', { name: '3 Estrelas', exact: true })).toBeVisible();
        await expect(page.getByText('Avaliação atualizada E2E', { exact: true })).toBeVisible(); await expect(page.getByText('Segundo usuário E2E', { exact: true })).toBeVisible();
        const persisted = (await (await context.request.get('/api/v1/product/' + id)).json()).product;
        expect(persisted.reviews).toHaveLength(2); expect(persisted.ratings).toBe(3); expect(persisted.numOfReviews).toBe(2);
    } finally {
        try {
            const removed = await adminContext.request.delete('/api/v1/product/' + id, { headers: { 'X-Fetech-CSRF': '1' } });
            expect(removed.status()).toBe(200);
        } finally { await context.close(); await adminContext.close(); }
    }
});
