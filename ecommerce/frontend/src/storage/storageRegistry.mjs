import { normalizeCartItems } from './cartDomain.mjs';
import { shippingFields } from '../../../shared/shippingAddress.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('INVALID_SHAPE'); };
function cart(value) { if (!Array.isArray(value) || value.length > 1000) invalid(); return normalizeCartItems(value); }
function shipping(value) {
    if (!object(value)) invalid();
    return Object.fromEntries(Object.keys(shippingFields).filter(key => Object.hasOwn(value, key)).map(key => {
        if (typeof value[key] !== 'string' || value[key].length > shippingFields[key].max) invalid();
        return [key, value[key]];
    }));
}
function theme(value) { if (!['light', 'dark'].includes(value)) invalid(); return value; }
function attempt(value) {
    if (!object(value)) invalid();
    if (value.recoveryRequired === true && Object.keys(value).length === 1) return { recoveryRequired: true };
    if (Object.keys(value).length !== 2 || typeof value.key !== 'string' || !/^[A-Za-z0-9_.:-]{16,128}$/.test(value.key)
        || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) invalid();
    return { key: value.key, fingerprint: value.fingerprint };
}
const spec = value => Object.freeze({ version: 1, maxBytes: 1024 * 1024, format: 'ENVELOPE', ...value });
export const storageRegistry = Object.freeze({
    cart: spec({ key: 'cartItems', storageType: 'localStorage', classification: 'CART', clearPolicy: 'USER_CONFIRM_REQUIRED', defaultValue: () => [], validate: cart }),
    shipping: spec({ key: 'shippingInfo', storageType: 'localStorage', classification: 'USER_DRAFT', clearPolicy: 'USER_CONFIRM_REQUIRED', defaultValue: () => ({}), validate: shipping, maxBytes: 16384 }),
    theme: spec({ key: 'fetech-color-mode', storageType: 'localStorage', classification: 'UI_PREFERENCE', clearPolicy: 'AUTO_RECOVERABLE', defaultValue: () => null, validate: theme, maxBytes: 512 }),
    attempt: spec({ key: 'fetech.orderAttempt.v1', storageType: 'sessionStorage', classification: 'COMMERCIAL_RECOVERY', clearPolicy: 'PRESERVE_COMMERCIAL', defaultValue: () => null, validate: attempt, format: 'KEY_VERSIONED', maxBytes: 1024 }),
});
export const knownSpec = value => Object.values(storageRegistry).includes(value);
export function decodeStoredValue(spec, raw) {
    if (raw.length > spec.maxBytes) throw new Error('VALUE_TOO_LARGE');
    if (spec === storageRegistry.theme && ['light', 'dark'].includes(raw)) return { value: theme(raw), sourceVersion: 0 };
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('INVALID_JSON'); }
    if (spec.format === 'KEY_VERSIONED') {
        if (object(parsed) && Object.hasOwn(parsed, 'version')) throw new Error('UNSUPPORTED_VERSION');
        return { value: spec.validate(parsed), sourceVersion: 1 };
    }
    if (object(parsed) && Object.hasOwn(parsed, 'version')) {
        if (parsed.version !== spec.version) throw new Error('UNSUPPORTED_VERSION');
        return { value: spec.validate(parsed.data), sourceVersion: 1 };
    }
    return { value: spec.validate(parsed), sourceVersion: 0 };
}
export function encodeStoredValue(spec, value) {
    const normalized = spec.validate(value);
    const raw = JSON.stringify(spec.format === 'KEY_VERSIONED' ? normalized : { version: spec.version, data: normalized });
    if (raw.length > spec.maxBytes) throw new Error('VALUE_TOO_LARGE');
    return raw;
}
