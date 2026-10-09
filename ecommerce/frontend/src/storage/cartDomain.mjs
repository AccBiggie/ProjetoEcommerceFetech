import { readCents, multiplyCents, formatCentsToDecimal } from '../../../shared/money.mjs';
const fields = ['product', 'name', 'image', 'stock', 'quantity', 'price', 'priceCents'];
export function normalizeCartItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((value, index) => {
        const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const item = Object.fromEntries(fields.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]));
        // Keep malformed entries visible/removable, without rendering arbitrary objects.
        const shapeInvalid = typeof item.product !== 'string' || !item.product || typeof item.name !== 'string'
            || typeof item.image !== 'string' || !Number.isSafeInteger(item.stock) || item.stock < 0;
        const safe = { product: typeof item.product === 'string' && item.product ? item.product : `invalid-local-item-${index}`,
            name: typeof item.name === 'string' ? item.name : 'Item local inválido', image: typeof item.image === 'string' ? item.image : '/Profile.png',
            stock: Number.isSafeInteger(item.stock) && item.stock >= 0 ? item.stock : 0, quantity: Number.isSafeInteger(item.quantity) ? item.quantity : 0 };
        try {
            const priceCents = readCents(item, 'price'); multiplyCents(priceCents, item.quantity);
            return { ...safe, priceCents, price: formatCentsToDecimal(priceCents), ...(shapeInvalid || object.moneyInvalid === true ? { moneyInvalid: true } : {}) };
        } catch { return { ...safe, moneyInvalid: true }; }
    });
}
