const { events } = require('./contract');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const messages = Object.freeze({
    ACCOUNT_REGISTERED: ['Sua conta Fetech foi criada', 'Sua conta foi criada. Acesse o site para gerenciar sua conta.'],
    ACCOUNT_DEACTIVATED: ['Sua conta Fetech foi desativada', 'Sua conta foi desativada. Se você não esperava esta alteração, acesse o site.'],
    ACCOUNT_REACTIVATED: ['Sua conta Fetech foi reativada', 'Sua conta foi reativada. Entre novamente para acessar sua conta.'],
    PRIVACY_REQUEST_CREATED: ['Solicitação de privacidade registrada', 'Recebemos sua solicitação de anonimização. Isso ainda não significa que a anonimização foi executada.'],
});
function render(event, { origin, order } = {}) {
    if (!events.includes(event.eventType)) throw new Error('Unknown email template');
    const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== origin) throw new Error('Invalid frontend origin');
    let subject, body, path = '/account';
    if (['ORDER_CREATED', 'ORDER_CANCELLED'].includes(event.eventType)) {
        if (!order || String(order._id) !== String(event.entityId) || String(order.user) !== String(event.recipientUserId)) throw new Error('Invalid email order');
        path = '/order/' + order._id;
        if (event.eventType === 'ORDER_CANCELLED') {
            subject = 'Seu pedido foi cancelado';
            body = `Seu pedido ${order._id} foi cancelado. Ele não seguirá o processamento normal.`;
        } else {
            const money = require('../../utils/money');
            subject = 'Recebemos seu pedido na Fetech';
            body = `Recebemos seu pedido ${order._id}. Total: ${money.formatBRLFromCents(money.readCents(order, 'totalPrice'))}. Você pode acompanhar o status pela sua conta.`;
        }
    } else [subject, body] = messages[event.eventType];
    const link = origin + path;
    return { subject, text: body + '\n' + link, html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">Acessar a Fetech</a></p>` };
}
module.exports = { render, escapeHtml, registry: events };
