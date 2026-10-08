const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);

test('entrega manual: validação, localStorage/reload e zeros no detalhe', async ({ page }) => {
    expect((await mutation(page, 'post', '/api/v1/register', { data: {
        name: 'Cliente Snapshot', email: 'snapshot-manual@routes.example.com', password,
    } })).status()).toBe(201);
    await page.goto('/products');
    await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).first().click();
    await page.goto('/shipping');
    const values = { 'Nome do destinatário': 'Cliente Snapshot', Endereço: 'Rua Snapshot', Número: 'KM 12',
        Complemento: '  apto 10  ', Bairro: 'Centro', Cidade: 'Curitiba', Estado: 'PR', País: 'Brasil',
        CEP: '01234567', Telefone: '04123456789' };
    for (const [name, value] of Object.entries(values)) await page.getByRole('textbox', { name, exact: true }).fill(value);
    const cep = page.getByRole('textbox', { name: 'CEP', exact: true });
    const phone = page.getByRole('textbox', { name: 'Telefone', exact: true });
    const city = page.getByRole('textbox', { name: 'Cidade', exact: true });
    const submit = page.getByRole('button', { name: 'Criar pedido', exact: true });
    let posts = 0;
    page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/api/v1/order/new')) posts++; });
    await cep.fill('123'); await submit.click();
    expect(await cep.evaluate(el => el.validity.patternMismatch)).toBe(true);
    await cep.fill(values.CEP); await phone.fill('123'); await submit.click();
    expect(await phone.evaluate(el => el.validity.patternMismatch)).toBe(true);
    await phone.fill(values.Telefone); await city.fill('   '); await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cidade:' })).toBeVisible();
    expect(posts).toBe(0);
    await city.fill(values.Cidade);
    const denied = route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Fixture sem gravação.' }) });
    await page.route('**/api/v1/order/new', denied);
    await submit.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Fixture sem gravação.' })).toBeVisible();
    await page.unroute('**/api/v1/order/new', denied);
    await page.reload();
    await expect(cep).toHaveValue(values.CEP);
    await expect(phone).toHaveValue(values.Telefone);
    await expect(page.getByRole('textbox', { name: 'Número', exact: true })).toHaveValue('KM 12');
    const created = page.waitForResponse(r => r.url().endsWith('/api/v1/order/new') && r.status() === 201);
    await submit.click();
    const order = (await (await created).json()).order;
    expect(order.shippingInfoVersion).toBe(2);
    expect(order.shippingInfo.pinCode).toBe(values.CEP);
    expect(order.shippingInfo.phoneNo).toBe(values.Telefone);
    expect(order.shippingInfo.complement).toBe('apto 10');
    await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
    await expect(page.getByText('CEP 01234567', { exact: true })).toBeVisible();
    await expect(page.getByText('Telefone 04123456789', { exact: true })).toBeVisible();
    await expect(page.getByText('Rua Snapshot, KM 12', { exact: true })).toBeVisible();
});
