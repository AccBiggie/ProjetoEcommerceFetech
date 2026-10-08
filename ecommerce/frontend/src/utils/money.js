import { readCents, multiplyCents, sumCents, formatCentsToDecimal } from '../../../shared/money.mjs';
export * from '../../../shared/money.mjs';
export const cartTotalCents = items => sumCents(items.map(item => multiplyCents(readCents(item, 'price'), item.quantity)));
export function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    try { const priceCents = readCents(item, 'price'); multiplyCents(priceCents, item.quantity);
      return [{ ...item, priceCents, price: formatCentsToDecimal(priceCents) }];
    } catch { return [{ ...item, moneyInvalid: true }]; }
  });
}
export function loadCartItems(storage) {
  try { return normalizeCartItems(JSON.parse(storage.getItem('cartItems') || '[]')); }
  catch { return []; }
}
