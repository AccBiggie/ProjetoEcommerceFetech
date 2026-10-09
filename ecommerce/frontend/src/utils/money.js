import { readCents, multiplyCents, sumCents, formatCentsToDecimal } from '../../../shared/money.mjs';
import { readStoredValue } from '../storage/safeStorage.mjs';
import { storageRegistry } from '../storage/storageRegistry.mjs';
export { normalizeCartItems } from '../storage/cartDomain.mjs';
export * from '../../../shared/money.mjs';
export const cartTotalCents = items => sumCents(items.map(item => multiplyCents(readCents(item, 'price'), item.quantity)));
export function loadCartItems(storage) {
  return readStoredValue(storageRegistry.cart, { storage }).value;
}
