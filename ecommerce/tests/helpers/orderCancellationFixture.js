const crypto = require('node:crypto');
const mongoose = require('mongoose');
const h = require('../authHarness');
const Product = require('../../backend/models/productModel');
const Order = require('../../backend/models/orderModel');
const Movement = require('../../backend/models/stockMovementModel');
const Outbox = require('../../backend/models/emailOutboxModel');
const Audit = require('../../backend/models/adminAuditEventModel');
const shippingInfo = { recipientName: 'Fixture', address: 'Rua Fixture', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' };
function fixture() {
  const f = { h, mongoose, Product, Order, Movement, Outbox, Audit, shippingInfo };
  f.start = async () => { await h.start(); f.data = await require('../fixtures').fixtures(); f.customer = await h.login(f.data.users.user); f.admin = await h.login(f.data.users.admin); f.other = await h.login(f.data.users.other); await Audit.init(); };
  f.reset = async () => { await h.clearRateLimits(); await Product.updateMany({}, { $set: { Stock: 6 } }); };
  f.create = async (count = 1, cookie = f.customer, quantity = 2) => {
    const body = { shippingInfo, orderItems: f.data.products.slice(0, count).map(p => ({ product: p.id, quantity })) }, key = crypto.randomUUID();
    const reply = await h.request('POST', '/order/new', body, cookie, 201, { 'Idempotency-Key': key });
    return { id: reply.result.order._id, oid: new mongoose.Types.ObjectId(reply.result.order._id), body, key };
  };
  f.cancel = (id, expected = 200, admin = false, cookie = admin ? f.admin : f.customer, body = {}, headers) => h.request('POST', (admin ? '/admin' : '') + '/order/' + id + '/cancel', body, cookie, expected, headers);
  f.raw = () => mongoose.connection.db.collection('orders');
  f.artifacts = async id => ({ releases: await Movement.countDocuments({ order: id, type: 'RELEASE' }), events: await Outbox.countDocuments({ entityId: id, eventType: 'ORDER_CANCELLED' }), audits: await Audit.countDocuments({ targetId: id, action: 'ORDER_CANCELLED' }) });
  f.snapshot = async () => JSON.stringify(await Promise.all(['orders','products','stockmovements','emailoutboxes','adminauditevents'].map(name => mongoose.connection.db.collection(name).find({}).sort({ _id: 1 }).toArray())));
  return f;
}
module.exports = { fixture };
