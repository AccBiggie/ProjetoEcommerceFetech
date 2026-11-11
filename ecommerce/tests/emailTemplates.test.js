const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { render, escapeHtml, registry } = require('../backend/services/email/templates');
const orderId = 'abcdefabcdefabcdefabcdef', userId = '123456789012345678901234';
const event = { eventType: 'ORDER_CREATED', entityId: orderId, recipientUserId: userId };
const context = { origin: 'https://shop.example.test', order: { _id: orderId, user: userId, totalPriceCents: 19990, totalPrice: 999, shippingInfo: { address: 'PERSON_ADDRESS_SENTINEL' } } };
for (const eventType of registry) test('MAIL template ' + eventType + ' pt-BR text/html only server links without PII/tracking', () => {
    const message = render({ ...event, eventType }, context); for (const field of ['subject', 'text', 'html']) assert.ok(message[field].length > 10);
    assert.match(message.text, /https:\/\/shop\.example\.test\/(account|order)/); assert.doesNotMatch(message.html, /<img|<script|onerror|tracking|pixel|PERSON_|marketing|newsletter/i);
});
test('MAIL Order text states receipt without claiming payment or shipping', () => { const m = render(event, context); assert.match(m.text, /Recebemos seu pedido/); assert.doesNotMatch(m.text, /pago|aprovado|enviado|entregue|pagamento confirmado/i); });
test('MAIL money uses historical integer cents over legacy/current price', () => assert.match(render(event, context).text, /199,90/));
test('MAIL money handles 50 cents exactly', () => assert.match(render(event, { ...context, order: { ...context.order, totalPriceCents: 50 } }).text, /0,50/));
test('MAIL cancelamento informa somente cancelamento sem refund/return', () => {
    const message = render({ ...event, eventType: 'ORDER_CANCELLED' }, context);
    assert.match(message.text, /foi cancelado/); assert.match(message.html, /foi cancelado/);
    assert.doesNotMatch(message.text + message.html, /reembolso|estorno|devolvido|devolução|logística reversa/i);
});
for (const value of ['<script>alert(1)</script>', '<img onerror="alert(1)">', '&', '"', "'"]) test('MAIL HTML escapes domain value ' + JSON.stringify(value), () => { const html = escapeHtml(value); assert.doesNotMatch(html, /[<>"']/); });
for (const eventType of ['PAYMENT_CONFIRMED', 'ORDER_SHIPPED', 'TRACKING_AVAILABLE', 'ORDER_REFUNDED', '../template']) test('MAIL unavailable or client-controlled event is rejected ' + eventType, () => assert.throws(() => render({ ...event, eventType }, context)));
for (const origin of ['https://user:password@example.test', 'javascript:alert(1)', '//evil.test', 'https://shop.example.test/path']) test('MAIL unsafe frontend URL rejected ' + origin, () => assert.throws(() => render(event, { ...context, origin })));
test('MAIL request Host/Origin cannot change fixed template URL', () => assert.ok(!render({ ...event, host: 'evil.test', origin: 'https://evil.test' }, context).html.includes('evil.test')));
test('MAIL wrong owner/order and invalid money fail template', () => { for (const order of [{ ...context.order, user: orderId }, { ...context.order, _id: userId }, { ...context.order, totalPriceCents: NaN }]) assert.throws(() => render(event, { ...context, order })); });
test('MAIL nodemailer/sendMail restricted to adapter; runtime never imports fake', () => {
    const root = path.join(__dirname, '../backend'); const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []);
    for (const file of walk(root)) { const source = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(source, /fakeEmailProvider|tests\/helpers/); if (!file.endsWith('smtpEmailProvider.js')) assert.doesNotMatch(source, /require\(['"]nodemailer['"]\)|\.sendMail\(/); }
});
