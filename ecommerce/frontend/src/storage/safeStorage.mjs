import { storageRegistry, knownSpec, decodeStoredValue, encodeStoredValue } from './storageRegistry.mjs';
const events = new Map(), listeners = new Set(), blocked = new WeakSet();
let snapshot = [];
const reasons = new Set(['INVALID_JSON', 'INVALID_SHAPE', 'UNSUPPORTED_VERSION', 'VALUE_TOO_LARGE']);
function notice(spec, reason) {
    const key = `${spec.storageType}:${spec.key}:${reason}`;
    if (events.has(key)) return;
    events.set(key, Object.freeze({ key: spec.key, storageType: spec.storageType, reason }));
    snapshot = [...events.values()]; listeners.forEach(listener => listener());
}
export const subscribeStorageNotices = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getStorageNotices = () => snapshot;
export function dismissStorageNotices() { events.clear(); snapshot = []; listeners.forEach(listener => listener()); }
function access(spec, options) { return Object.hasOwn(options, 'storage') ? options.storage : globalThis[spec.storageType]; }
function failure(spec, reason) { notice(spec, reason); return { value: spec.defaultValue(), ok: false, recovered: true, reason, sourceVersion: null }; }
export function writeStoredValue(spec, value, options = {}) {
    if (!knownSpec(spec)) return { ok: false, reason: 'UNKNOWN_SPEC' };
    let raw; try { raw = encodeStoredValue(spec, value); } catch { notice(spec, 'INVALID_WRITE'); return { ok: false, reason: 'INVALID_WRITE' }; }
    try { access(spec, options).setItem(spec.key, raw); return { ok: true }; }
    catch { notice(spec, 'STORAGE_WRITE_FAILED'); return { ok: false, reason: 'STORAGE_WRITE_FAILED' }; }
}
export function removeStoredValue(spec, options = {}) {
    if (!knownSpec(spec)) return { ok: false, reason: 'UNKNOWN_SPEC' };
    try { access(spec, options).removeItem(spec.key); return { ok: true }; }
    catch { notice(spec, 'STORAGE_REMOVE_FAILED'); return { ok: false, reason: 'STORAGE_REMOVE_FAILED' }; }
}
export function readStoredValue(spec, options = {}) {
    if (!knownSpec(spec)) return { ok: false, value: null, reason: 'UNKNOWN_SPEC' };
    let storage, raw;
    try { storage = access(spec, options); raw = storage.getItem(spec.key); }
    catch { return failure(spec, 'STORAGE_READ_FAILED'); }
    if (spec === storageRegistry.attempt && blocked.has(storage)) return failure(spec, 'COMMERCIAL_REVIEW_REQUIRED');
    if (raw === null) return { value: spec.defaultValue(), ok: true, recovered: false, reason: null, sourceVersion: null };
    let decoded;
    try { decoded = decodeStoredValue(spec, raw); }
    catch (error) {
        const reason = reasons.has(error.message) ? error.message : 'INVALID_SHAPE';
        // Future schema is preserved for downgrade; never guess its meaning.
        if (reason !== 'UNSUPPORTED_VERSION') {
            try {
                if (storage.getItem(spec.key) === raw) {
                    if (spec === storageRegistry.attempt) {
                        blocked.add(storage);
                        storage.setItem(spec.key, encodeStoredValue(spec, { recoveryRequired: true }));
                    } else storage.removeItem(spec.key);
                }
            } catch { notice(spec, 'STORAGE_RECOVERY_FAILED'); }
        }
        return failure(spec, reason);
    }
    if (decoded.sourceVersion < spec.version) {
        try { if (storage.getItem(spec.key) === raw) writeStoredValue(spec, decoded.value, { storage }); }
        catch { notice(spec, 'STORAGE_WRITE_FAILED'); }
    }
    return { ...decoded, ok: true, recovered: false, reason: null };
}
// Generic recovery never even reads commercial state or valid drafts/cart.
export function restoreInterfacePreferences(options = {}) {
    return Object.values(storageRegistry).filter(spec => spec.clearPolicy === 'AUTO_RECOVERABLE').map(spec => removeStoredValue(spec, options));
}
export function acknowledgeCommercialRecovery(options = {}) {
    const spec = storageRegistry.attempt;
    let storage, raw;
    try {
        storage = access(spec, options); raw = storage.getItem(spec.key);
        if (raw === null && !blocked.has(storage)) return false;
        try { const decoded = decodeStoredValue(spec, raw); if (!decoded.value.recoveryRequired) return false; } catch { /* Only the invalid commercial entry may be discarded explicitly. */ }
        if (storage.getItem(spec.key) !== raw || !removeStoredValue(spec, { storage }).ok) return false;
        blocked.delete(storage); return true;
    } catch { return false; }
}
