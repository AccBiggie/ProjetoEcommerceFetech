const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { fixtures } = require('../fixtures');
const Address = require('../../backend/models/addressModel');
const Product = require('../../backend/models/productModel');
const { managedId } = require('../../backend/utils/mediaContract');
const shipping = { recipientName: 'PERSON_NAME_SENTINEL', address: 'PERSON_ADDRESS_SENTINEL', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '13998765432' };
async function start() {
    const t = await require('./mediaHarness').start();
    const data = await fixtures(), admin = data.users.admin, adminCookie = await t.h.login(admin);
    async function graph() {
        await t.h.clearRateLimits();
        const user = await t.h.createUser(); user.name = shipping.recipientName; user.email = `privacy-${crypto.randomUUID()}@example.test`; await user.save();
        const cookie = await t.h.login(user), publicId = managedId(user._id); t.fake.assets.add(publicId);
        await t.h.User.updateOne({ _id: user._id }, { $set: { avatar: { public_id: publicId, url: 'https://example.test/PRIVATE_AVATAR_SENTINEL.png' } } });
        await require('../../backend/models/mediaUploadIntentModel').create({ user: user._id, publicId, status: 'ATTACHED', expectedAvatarRevision: 0 });
        const address = await Address.create({ user: user._id, label: 'PERSON_ADDRESS_SENTINEL', ...shipping });
        const product = data.products[0]; await Product.updateOne({ _id: product._id }, { $inc: { Stock: 10 } });
        const order = await t.h.request('POST', '/order/new', { shippingInfo: shipping, orderItems: [{ product: product.id, quantity: 1 }] }, cookie, 201, { 'Idempotency-Key': crypto.randomUUID() });
        await t.h.request('PUT', '/review', { productId: product.id, rating: 5, comment: 'Comentário preservado; conteúdo livre não recebe regex.' }, cookie, 200);
        await t.h.request('PATCH', '/admin/order/' + order.result.order._id + '/archive', {}, adminCookie, 200);
        return { user, cookie, publicId, address, product, order: order.result.order };
    }
    const deactivate = g => t.h.request('PATCH', '/admin/user/' + g.user.id + '/deactivate', {}, adminCookie, 200);
    const request = async g => (await t.h.request('POST', '/me/privacy/anonymization-request', {}, g.cookie, 201)).result.request;
    const execute = (g, request, expected = 200, body = { confirmation: 'ANONIMIZAR ' + g.user.id }) => t.h.request('POST', '/admin/privacy/requests/' + request._id + '/anonymize', body, adminCookie, expected);
    return { ...t, data, admin, adminCookie, graph, deactivate, request, execute, db: mongoose.connection.db };
}
module.exports = { start, shipping };
