const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function withCsrf(method, overrides = {}) {
    const headers = new Headers();
    if (unsafeMethods.has(method.toUpperCase())) headers.set('X-Fetech-CSRF', '1');
    for (const [name, value] of Object.entries(overrides)) {
        if (value == null) headers.delete(name); else headers.set(name, value);
    }
    return Object.fromEntries(headers);
}
module.exports = { withCsrf };
