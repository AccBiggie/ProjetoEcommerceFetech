const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
test('pagamento: cliente vê Pendente e admin não pode enviar nem forçar confirmação', async ({ page, browser }) => {
    expect((await mutation(page, 'post', '/api/v1/login', { data: { email: 'state-machine@routes.example.com', password } })).status()).toBe(200);
    const product = (await (await page.request.get('/api/v1/products')).json()).products[0];
    const response = await mutation(page, 'post', '/api/v1/order/new', { headers: { 'Idempotency-Key': require('node:crypto').randomUUID() }, data: {
        paymentStatus: 'PAID', paidAt: new Date().toISOString(), paymentInfo: { status: 'Paid' },
        shippingInfo: { recipientName: 'Cliente Estado', address: 'Rua Estado', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' }, orderItems: [{ product: product._id, quantity: 1 }],
    } });
    expect(response.status()).toBe(201); const order = (await response.json()).order;
    await page.goto('/order/' + order._id); await expect(page.getByText('Pagamento: Pendente', { exact: true })).toBeVisible();
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3300' }), admin = await context.newPage();
    try {
        expect((await mutation(admin, 'post', '/api/v1/login', { data: { email: 'admin@routes.example.com', password } })).status()).toBe(200);
        await admin.goto('/order/' + order._id); await expect(admin.getByText('Pagamento: Pendente', { exact: true })).toBeVisible();
        await admin.goto('/dashboard'); await admin.getByRole('tab', { name: 'Pedidos', exact: true }).click();
        const row = admin.getByRole('row').filter({ hasText: order._id });
        await expect(row.getByRole('button', { name: 'Marcar enviado' })).toBeDisabled();
        await expect(row).toContainText('O envio ficará disponível após a confirmação do pagamento.');
        await expect(admin.getByRole('button', { name: /Marcar como pago|Confirmar pagamento/i })).toHaveCount(0);
        const spoof = await mutation(admin, 'put', '/api/v1/admin/order/' + order._id, { data: { status: 'Shipped', paymentStatus: 'PAID', paidAt: new Date().toISOString() } });
        expect(spoof.status()).toBe(409); expect((await spoof.json()).code).toBe('ORDER_PAYMENT_NOT_CONFIRMED');
        await row.getByRole('button', { name: 'Arquivar', exact: true }).click(); await admin.getByRole('button', { name: 'Confirmar arquivamento' }).click();
        await expect(row).toHaveCount(0); await admin.getByLabel('Filtrar pedidos').selectOption('archived');
        await expect(row).toContainText('Arquivado'); await expect(row.getByRole('button', { name: 'Marcar enviado' })).toBeDisabled();
        await page.reload(); await expect(page.getByText('Pagamento: Pendente', { exact: true })).toBeVisible();
    } finally { await context.close(); }
});
