const prohibited = /password|token|jwt|authorization|cookie|secret|apikey|idempotency|csrf|dburi|email|phone|pincode|recipient|address|neighborhood|city|number|headers|body|query|params|originalurl|useragent|ip|config/i;
const normalize = key => key.replace(/[^a-z0-9]/gi, '');
function redact(value, seen = new WeakSet(), depth = 0) {
    if (depth > 8) return '[REDACTED]';
    if (typeof value === 'string') return value.replace(/(?:mongodb(?:\+srv)?|https?):\/\/\S+|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b[^\s@]+@[^\s@]+/gi, '[REDACTED]').slice(0, 512);
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value !== 'object' || seen.has(value)) return '[REDACTED]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item, seen, depth + 1));
    const result = Object.create(null);
    // Never invoke getters or a custom toJSON supplied by a caller.
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value)).slice(0, 100)) {
        result[key] = prohibited.test(normalize(key)) || !('value' in descriptor) ? '[REDACTED]' : redact(descriptor.value, seen, depth + 1);
    }
    return result;
}
module.exports = { redact };
