const Product = require('../../backend/models/productModel');
const Movement = require('../../backend/models/stockMovementModel');
const Category = require('../../backend/models/categoryModel');
const Order = require('../../backend/models/orderModel');
const Audit = require('../../backend/models/adminAuditEventModel');
const { productData } = require('../fixtures');
const shippingInfo = { recipientName: 'Cliente Fixture', address: 'Fixture', number: '1', complement: '', neighborhood: 'Centro', city: 'Fixture', state: 'PR', country: 'Brasil', pinCode: '87000000', phoneNo: '44999999999' };
async function start() {
    const env = await require('./observabilityHarness').start(), { h } = env;
    await Promise.all([Product.init(), Movement.init(), Category.init(), Order.init(), Audit.init()]);
    const admin = await h.createUser('admin'), user = await h.createUser(), cookie = await h.login(admin), userCookie = await h.login(user);
    const category = await Category.create({ name: 'Hardware', name_key: 'hardware' });
    const request = (method, route, body, expected) => h.request(method, route, body, cookie, expected);
    const create = async (overrides = {}, expected = 201) => request('POST', '/product/new', productData(overrides), expected);
    const update = (id, body, expected = 200) => request('PUT', '/product/' + id, body, expected);
    const order = (id, quantity = 1) => h.request('POST', '/order/new', { shippingInfo, orderItems: [{ product: String(id), quantity }] }, userCookie, undefined, { 'Idempotency-Key': require('node:crypto').randomUUID() });
    const healthy = async () => {
        const report = await require('../../backend/utils/productAudit').auditProducts(Product.db, { write() {} });
        require('node:assert/strict').deepEqual(report.issues, []);
        return report;
    };
    return { ...env, admin, user, cookie, userCookie, category, request, create, update, order, healthy };
}
module.exports = { start, Product, Movement, Category, Order, Audit, productData, shippingInfo };
