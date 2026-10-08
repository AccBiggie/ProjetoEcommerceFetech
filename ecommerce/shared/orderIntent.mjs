import { normalizeShippingAddress } from './shippingAddress.mjs';
import { addCents } from './money.mjs';

export const ORDER_OPERATION = 'ORDER_CREATE_V1';
export class CheckoutIntentError extends Error {
    constructor(message) { super(message); this.statusCode = 400; }
}
export function canonicalCheckout(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CheckoutIntentError('Dados do pedido inválidos.');
    if (!Array.isArray(body.orderItems) || !body.orderItems.length) throw new CheckoutIntentError('O pedido precisa conter produtos.');
    const shippingInfo = normalizeShippingAddress(body.shippingInfo);
    const quantities = new Map();
    for (const item of body.orderItems) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.product !== 'string' || !/^[0-9a-fA-F]{24}$/.test(item.product)) throw new CheckoutIntentError('Produto inválido no pedido.');
        if (typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new CheckoutIntentError('Quantidade inválida.');
        const id = item.product.toLowerCase();
        quantities.set(id, addCents(quantities.get(id) || 0, item.quantity));
    }
    const orderItems = [...quantities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([product, quantity]) => ({ product, quantity }));
    return { shippingInfo, orderItems };
}
export function serializeOrderIntent(body) {
    const { shippingInfo, orderItems } = canonicalCheckout(body);
    return JSON.stringify({ version: ORDER_OPERATION, shippingInfo, orderItems });
}
