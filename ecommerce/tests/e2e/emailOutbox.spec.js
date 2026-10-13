const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { password } = require('../fixtures');
const { installSecurityChecks, mutation } = require('./securityChecks');
const { context } = require('../helpers/e2eContext');
installSecurityChecks(test, expect);
test('emails: registration, checkout/replay, lifecycle/privacy events and fake worker', async ({ page, browser }) => {
    const settings = context(), state = JSON.parse(fs.readFileSync(settings.state, 'utf8'));
    expect(state.database).toMatch(/^fetech_e2e_\d+_\d+$/);
    expect(state.uri).toBe(require('../replicaSetHarness').testUri(state.database));
    await mongoose.connect(state.uri, { autoIndex: false, autoCreate: false });
    require('../../backend/config/runtimeConfig').initializeConfig({ NODE_ENV: 'test', DB_URI: state.uri, LOG_LEVEL: 'error' }, { profile: 'email-outbox-audit' });
    // Preserve the other browser fixtures' shared quota; this test owns only its
    // registration attempt in the runner-owned temporary database.
    const registrationLimits = mongoose.connection.db.collection('authratelimits');
    const registrationBuckets = await registrationLimits.find({ scope: 'register:ip' }).toArray();
    await registrationLimits.deleteMany({ scope: 'register:ip' });
    const customerContext = await browser.newContext({ baseURL: settings.origin });
    try {
        const customer = await customerContext.newPage(); await customer.goto('/login');
        await customer.getByRole('tab', { name: 'Criar conta', exact: true }).click();
        await customer.locator('.signUpForm input[name=name]').fill('Cliente Email E2E');
        await customer.locator('.signUpForm input[name=email]').fill('email-outbox-e2e@example.test');
        await customer.locator('.signUpForm input[name=password]').fill(password);
        const registered = customer.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/register' && r.request().method() === 'POST');
        await customer.locator('.signUpBtn').click(); const registration = await registered; expect(registration.status()).toBe(201);
        const userId = (await registration.json()).user._id;
        await expect(customer).toHaveURL(url => url.pathname === '/');
        const outbox = mongoose.connection.db.collection('emailoutboxes'), user = new mongoose.Types.ObjectId(userId);
        expect(await outbox.countDocuments({ recipientUserId: user, eventType: 'ACCOUNT_REGISTERED' })).toBe(1);
        const products = (await (await customerContext.request.get('/api/v1/products?keyword=Produto%20extra')).json()).products;
        expect(products).toHaveLength(1); const product = products[0];
        const shipping = { recipientName: 'Cliente Email', address: 'Rua Teste', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '13998765432' };
        await customer.evaluate(({ product, shipping }) => {
            localStorage.setItem('cartItems', JSON.stringify([{ product: product._id, name: product.name, priceCents: product.priceCents, price: product.price, image: product.images[0].url, stock: product.Stock, quantity: 1 }]));
            localStorage.setItem('shippingInfo', JSON.stringify(shipping));
        }, { product, shipping });
        await customer.goto('/shipping');
        const posted = customer.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/order/new' && r.request().method() === 'POST');
        await customer.getByRole('button', { name: 'Criar pedido', exact: true }).click(); const orderResponse = await posted;
        expect(orderResponse.status()).toBe(201); const order = (await orderResponse.json()).order;
        await expect(customer).toHaveURL(new RegExp('/order/' + order._id + '$'));
        const orderId = new mongoose.Types.ObjectId(order._id);
        expect(await outbox.countDocuments({ eventType: 'ORDER_CREATED', entityId: orderId })).toBe(1);
        const replay = await mutation(customer, 'post', '/api/v1/order/new', { headers: { 'Idempotency-Key': orderResponse.request().headers()['idempotency-key'] }, data: { shippingInfo: shipping, orderItems: [{ product: product._id, quantity: 1 }] } });
        expect(replay.status()).toBe(201); expect((await replay.json()).order._id).toBe(order._id);
        expect(await outbox.countDocuments({ eventType: 'ORDER_CREATED', entityId: orderId })).toBe(1);
        const fake = require('../helpers/fakeEmailProvider').createFakeEmailProvider();
        const worker = require('../../backend/services/email/worker').createWorker({ provider: fake, config: { frontend: { origin: settings.origin } } });
        expect(fake.calls).toHaveLength(0);
        for (let batch = 0; batch < 20; batch++) {
            await worker.once();
            if (await outbox.countDocuments({ eventType: 'ORDER_CREATED', entityId: orderId, status: 'SENT' })) break;
        }
        expect(await outbox.countDocuments({ eventType: 'ORDER_CREATED', entityId: orderId, status: 'SENT' })).toBe(1);
        const normalCalls = fake.calls.length; await worker.once(); expect(fake.calls).toHaveLength(normalCalls);
        expect(fake.calls.filter(message => message.text.includes(order._id))).toHaveLength(1);
        await worker.stop();
        await customer.goto('/account/privacy'); await customer.getByRole('button', { name: 'Solicitar anonimização da conta', exact: true }).click();
        await expect(customer.getByRole('status')).toContainText('Solicitada');
        expect(await outbox.countDocuments({ eventType: 'PRIVACY_REQUEST_CREATED', recipientUserId: user })).toBe(1);
        expect((await mutation(page, 'post', '/api/v1/login', { data: { email: 'admin@routes.example.com', password } })).status()).toBe(200);
        expect((await mutation(page, 'patch', '/api/v1/admin/user/' + userId + '/deactivate', { data: {} })).status()).toBe(200);
        expect(await outbox.countDocuments({ eventType: 'ACCOUNT_DEACTIVATED', recipientUserId: user })).toBe(1);
        expect((await customerContext.request.get('/api/v1/me')).status()).toBe(401);
        expect((await mutation(page, 'patch', '/api/v1/admin/user/' + userId + '/reactivate', { data: {} })).status()).toBe(200);
        expect(await outbox.countDocuments({ eventType: 'ACCOUNT_REACTIVATED', recipientUserId: user })).toBe(1);
    } finally {
        try {
            await registrationLimits.deleteMany({ scope: 'register:ip' });
            if (registrationBuckets.length) await registrationLimits.insertMany(registrationBuckets);
        } finally { await customerContext.close(); await mongoose.disconnect(); }
    }
});
