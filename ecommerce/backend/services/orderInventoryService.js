const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { readCents, sumCents, multiplyCents } = require('../utils/money');
const { validStock, inventoryError, insufficientStock } = require('../utils/inventory');
const ErrorHander = require('../utils/errorHander');
function createOrderInventoryService({ Product = require('../models/productModel'), Order = require('../models/orderModel'),
    Movement = require('../models/stockMovementModel'), connection = Order.db } = {}) {
    async function prepare(intent, session) {
        const orderItems = [];
        for (const item of [...intent.orderItems].sort((a, b) => a.product.localeCompare(b.product))) {
            const query = Product.findById(item.product).lean();
            const product = await (session ? query.session(session) : query);
            if (!product) throw new ErrorHander('Um produto do pedido não existe mais.', 404);
            if (!validStock(product.Stock)) throw inventoryError('ORDER_INVALID_STOCK', 'Estoque indisponível para este pedido.');
            if (item.quantity > product.Stock) throw insufficientStock();
            orderItems.push({ product: product._id, name: product.name, priceCents: readCents(product, 'price'),
                quantity: item.quantity, image: product.images[0]?.url || '/Profile.png' });
        }
        const itemsPriceCents = sumCents(orderItems.map(item => multiplyCents(item.priceCents, item.quantity)));
        return { orderItems, itemsPriceCents };
    }
    async function create({ intent, user, hashes, complete, requestId = null }) {
        await require('./email/enqueue').modelFor(connection).init();
        const session = await connection.startSession();
        const orderId = new mongoose.Types.ObjectId(), paymentId = crypto.randomUUID(), reservedAt = new Date();
        try {
            const result = await session.withTransaction(async () => {
                session.emailEnqueued = new Map();
                const prepared = await prepare(intent, session);
                for (const item of prepared.orderItems) {
                    const previous = await Product.findOneAndUpdate({ _id: item.product, Stock: { $gte: item.quantity } },
                        { $inc: { Stock: -item.quantity } }, { session, returnDocument: 'before', lean: true });
                    if (!previous) throw insufficientStock();
                    if (!validStock(previous.Stock)) throw inventoryError('ORDER_INVALID_STOCK', 'Estoque indisponível para este pedido.');
                    await Movement.create([{ product: item.product, order: orderId, type: 'RESERVE', version: 1,
                        quantity: item.quantity, stockBefore: previous.Stock, stockAfter: previous.Stock - item.quantity }], { session });
                }
                const [order] = await Order.create([{ _id: orderId, ...hashes, shippingInfoVersion: 2, shippingInfo: intent.shippingInfo,
                    orderItems: prepared.orderItems, user, itemsPriceCents: prepared.itemsPriceCents,
                    taxPriceCents: 0, shippingPriceCents: 0, totalPriceCents: prepared.itemsPriceCents,
                    paymentStatus: 'PENDING', paymentInfo: { id: paymentId, status: 'Pending' },
                    inventoryStatus: 'RESERVED', inventoryVersion: 1, inventoryReservedAt: reservedAt,
                }], { session });
                await complete(order, session);
                await require('./email/enqueue').enqueue({ eventType: 'ORDER_CREATED', recipientUserId: user, entityId: order._id, requestId }, session, connection);
                return order;
            }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
                maxCommitTimeMS: 10000, timeoutMS: 30000 });
            require('./email/enqueue').logCommitted(session); return result;
        } finally { await session.endSession(); }
    }
    return { prepare, create };
}
module.exports = { createOrderInventoryService };
