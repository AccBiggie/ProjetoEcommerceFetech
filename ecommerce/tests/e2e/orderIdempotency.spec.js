const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
const storageKey = 'fetech.orderAttempt.v1';
async function checkout(page, email) {
    expect((await mutation(page, 'post', '/api/v1/login', { data: { email, password } })).status()).toBe(200);
    await page.goto('/products');
    await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).first().click();
    await page.goto('/shipping');
    const fields = { 'Nome do destinatário': 'Cliente Fixture', Endereço: 'Rua Fixture', Número: '10A', Bairro: 'Centro',
        Cidade: 'Curitiba', Estado: 'PR', País: 'Brasil', CEP: '01234567', Telefone: '04123456789' };
    for (const [name, value] of Object.entries(fields)) await page.getByRole('textbox', { name, exact: true }).fill(value);
}
const attempt = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), storageKey);

test('idempotência: duplo submit, resposta perdida e reload recuperam um único pedido', async ({ page }) => {
    await checkout(page, 'idempotency-loss@routes.example.com');
    let release, persisted, originalKey, requests = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/v1/order/new', async route => {
        requests++;
        originalKey = route.request().headers()['idempotency-key'];
        expect(route.request().headers()['x-fetech-csrf']).toBe('1');
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        persisted = (await response.json()).order;
        await gate;
        await route.abort('failed'); // O servidor persistiu, o navegador perdeu a resposta.
    });
    const submit = page.getByRole('button', { name: 'Criar pedido', exact: true });
    await submit.evaluate(button => { button.click(); button.click(); });
    await expect(page.getByRole('button', { name: 'Criando pedido...' })).toBeDisabled();
    await page.locator('form').filter({ has: page.getByRole('heading', { name: 'Endereço de entrega' }) }).evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect.poll(() => Boolean(persisted)).toBe(true);
    expect(requests).toBe(1); release();
    await expect(page.getByRole('alert').filter({ hasText: 'Network Error' })).toBeVisible();
    expect((await attempt(page)).key).toBe(originalKey);
    await page.unroute('**/api/v1/order/new');
    await page.reload();
    expect((await attempt(page)).key).toBe(originalKey);
    const response = page.waitForResponse(r => r.url().endsWith('/api/v1/order/new') && r.status() === 201);
    await submit.click();
    const replay = await response;
    expect(replay.request().headers()['idempotency-key']).toBe(originalKey);
    expect(replay.headers()['idempotency-replayed']).toBe('true');
    expect((await replay.json()).order._id).toBe(persisted._id);
    await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
    expect(await attempt(page)).toBeNull();
    const orders = (await (await page.request.get('/api/v1/orders/me')).json()).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].shippingInfo.pinCode).toBe('01234567');
    expect(orders[0].shippingInfo.phoneNo).toBe('04123456789');
});

test('idempotência: 5xx/PROCESSING/conflito mantêm key; carrinho alterado cria outra intenção', async ({ page }) => {
    await checkout(page, 'idempotency-errors@routes.example.com');
    const keys = [];
    const failures = [503, 409, 409];
    await page.route('**/api/v1/order/new', route => {
        keys.push(route.request().headers()['idempotency-key']);
        const status = failures[keys.length - 1];
        return route.fulfill({ status, headers: keys.length === 2 ? { 'Retry-After': '2' } : {}, contentType: 'application/json',
            body: JSON.stringify({ success: false, message: `Fixture falha ${keys.length}` }) });
    });
    for (let index = 1; index <= 3; index++) {
        await page.getByRole('button', { name: 'Criar pedido', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: `Fixture falha ${index}` })).toBeVisible();
        expect((await attempt(page)).key).toBe(keys[0]);
        expect(keys).toHaveLength(index);
    }
    expect(new Set(keys).size).toBe(1);
    const technical = await attempt(page);
    expect(Object.keys(technical).sort()).toEqual(['fingerprint', 'key']);
    await page.unroute('**/api/v1/order/new');
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Aumentar quantidade', exact: true }).click();
    await page.getByRole('button', { name: 'Finalizar pedido', exact: true }).click();
    const created = page.waitForResponse(r => r.url().endsWith('/api/v1/order/new') && r.status() === 201);
    await page.getByRole('button', { name: 'Criar pedido', exact: true }).click();
    const response = await created;
    expect(response.request().headers()['idempotency-key']).not.toBe(keys[0]);
    expect((await response.json()).order.orderItems[0].quantity).toBe(2);
    await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
    expect(await attempt(page)).toBeNull();
});
