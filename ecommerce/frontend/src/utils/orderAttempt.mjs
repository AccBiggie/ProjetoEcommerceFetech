import { serializeOrderIntent } from '../../../shared/orderIntent.mjs';

export const ORDER_ATTEMPT_STORAGE = 'fetech.orderAttempt.v1';
const keyPattern = /^[A-Za-z0-9_.:-]{16,128}$/;
function read(storage) {
    try {
        const raw = storage.getItem(ORDER_ATTEMPT_STORAGE);
        if (raw === null) return null;
        const value = JSON.parse(raw);
        if (!value || !keyPattern.test(value.key) || typeof value.key !== 'string' || !/^[0-9a-f]{64}$/.test(value.fingerprint)
            || Object.keys(value).length !== 2) throw new Error();
        return value;
    } catch { throw new Error('Não foi possível recuperar a tentativa anterior. Confira seus pedidos antes de iniciar outra compra.'); }
}
function secureKey(crypto) {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export async function getOrderAttempt(body, { storage = globalThis.sessionStorage, crypto = globalThis.crypto } = {}) {
    const previous = read(storage);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeOrderIntent(body)));
    const fingerprint = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    if (previous?.fingerprint === fingerprint) return previous;
    const attempt = { key: secureKey(crypto), fingerprint };
    try { storage.setItem(ORDER_ATTEMPT_STORAGE, JSON.stringify(attempt)); }
    catch { throw new Error('Não foi possível preservar esta tentativa. Confira o armazenamento do navegador antes de enviar o pedido.'); }
    return attempt;
}
export function clearOrderAttempt(key, { storage = globalThis.sessionStorage } = {}) {
    if (read(storage)?.key === key) storage.removeItem(ORDER_ATTEMPT_STORAGE);
}
