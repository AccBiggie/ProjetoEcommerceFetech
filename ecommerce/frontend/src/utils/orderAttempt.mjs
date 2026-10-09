import { serializeOrderIntent } from '../../../shared/orderIntent.mjs';
import { storageRegistry } from '../storage/storageRegistry.mjs';
import { readStoredValue, writeStoredValue, removeStoredValue } from '../storage/safeStorage.mjs';

export const ORDER_ATTEMPT_STORAGE = storageRegistry.attempt.key;
const recoveryError = () => Object.assign(new Error('Não foi possível recuperar a tentativa anterior. Confira seus pedidos antes de iniciar outra compra.'), { commercialRecovery: true });
function secureKey(crypto) {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export async function getOrderAttempt(body, options = {}) {
    const crypto = options.crypto || globalThis.crypto;
    const saved = readStoredValue(storageRegistry.attempt, options);
    if (!saved.ok || saved.value?.recoveryRequired) throw recoveryError();
    const previous = saved.value;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeOrderIntent(body)));
    const fingerprint = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    if (previous?.fingerprint === fingerprint) {
        // A readable entry alone does not prove writes still work before this POST.
        if (!writeStoredValue(storageRegistry.attempt, previous, options).ok) throw new Error('Não foi possível preservar esta tentativa. Confira o armazenamento do navegador antes de enviar o pedido.');
        return previous;
    }
    const attempt = { key: secureKey(crypto), fingerprint };
    if (!writeStoredValue(storageRegistry.attempt, attempt, options).ok) throw new Error('Não foi possível preservar esta tentativa. Confira o armazenamento do navegador antes de enviar o pedido.');
    return attempt;
}
export function clearOrderAttempt(key, options = {}) {
    const saved = readStoredValue(storageRegistry.attempt, options);
    if (saved.ok && saved.value?.key === key) return removeStoredValue(storageRegistry.attempt, options).ok;
    return false;
}
