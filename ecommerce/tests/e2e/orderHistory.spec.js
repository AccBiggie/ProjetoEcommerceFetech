const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
test('histórico do cliente mantém pedido arquivado e snapshot sem metadata administrativa', async ({ page, playwright }) => {
    expect((await mutation(page, 'post', '/api/v1/register', { data: { name: 'Cliente Histórico', email: 'history@routes.example.com', password } })).status()).toBe(201);
    const product = (await (await page.request.get('/api/v1/products')).json()).products[0];
    const response = await mutation(page, 'post', '/api/v1/order/new', { headers: { 'Idempotency-Key': require('node:crypto').randomUUID() }, data: {
        shippingInfo: { recipientName: 'Cliente Histórico', address: 'Rua Histórico', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' }, orderItems: [{ product: product._id, quantity: 1 }],
    } });
    expect(response.status()).toBe(201); const order = (await response.json()).order;
    const admin = await playwright.request.newContext({ baseURL: require('../helpers/e2eContext').context().origin });
    try {
        expect((await admin.post('/api/v1/login', { headers: { 'X-Fetech-CSRF': '1' }, data: { email: 'admin@routes.example.com', password } })).status()).toBe(200);
        expect((await admin.patch(`/api/v1/admin/order/${order._id}/archive`, { headers: { 'X-Fetech-CSRF': '1' } })).status()).toBe(200);
        await page.goto('/orders'); await expect(page.getByRole('link', { name: order._id })).toBeVisible();
        await page.goto('/order/' + order._id); await expect(page.getByText('Rua Histórico', { exact: false })).toBeVisible();
        const detail = (await (await page.request.get('/api/v1/order/' + order._id)).json()).order;
        expect(detail.shippingInfo).toEqual(order.shippingInfo); expect(detail.administrativeArchivedBy).toBeUndefined(); expect(detail.administrativeArchivedAt).toBeUndefined();
    } finally { await admin.dispose(); }
});
