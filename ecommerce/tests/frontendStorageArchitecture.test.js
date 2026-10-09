const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '../frontend/src');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(js|jsx|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : []); }
const sources = files(root).map(file => ({ file: path.relative(root, file).replaceAll('\\', '/'), text: fs.readFileSync(file, 'utf8') }));
test('ARCH storage access/parsing centralized; no clear anywhere', () => {
    for (const { file, text } of sources) {
        assert.doesNotMatch(text, /(?:localStorage|sessionStorage)\s*\.\s*clear\s*\(/, file);
        if (!file.startsWith('storage/')) { assert.doesNotMatch(text, /JSON\.(?:parse|stringify)\s*\(/, file); assert.doesNotMatch(text, /\b(?:localStorage|sessionStorage)\b|\.\s*(?:getItem|setItem|removeItem)\s*\(/, file); }
        if (file.startsWith('reducers/')) assert.doesNotMatch(text, /storage\/|readStoredValue|writeStoredValue|removeStoredValue/, file);
    }
});
test('ARCH registry owns only factual four keys; no auth/cache persistence', () => {
    const { storageRegistry } = require('../frontend/src/storage/storageRegistry.mjs'); assert.deepEqual(Object.values(storageRegistry).map(s => s.key).sort(), ['cartItems', 'fetech-color-mode', 'fetech.orderAttempt.v1', 'shippingInfo'].sort());
    assert.equal(storageRegistry.attempt.clearPolicy, 'PRESERVE_COMMERCIAL'); assert.equal(storageRegistry.attempt.classification, 'COMMERCIAL_RECOVERY');
});
test('ARCH boundary outside Provider and guarded bootstrap imports', () => {
    const source = fs.readFileSync(path.join(root, 'index.jsx'), 'utf8'); assert.match(source, /<AppErrorBoundary><Provider/); assert.match(source, /try\s*\{[\s\S]*import\('\.\/store'\)/); assert.match(source, /catch[\s\S]*renderBootstrapRecovery/);
});
test('ARCH no production crash route, telemetry, raw error logs or storage quarantine', () => {
    for (const { file, text } of sources) {
        assert.doesNotMatch(text, /\/test\/crash|error-boundary-test|PRIVATE_STACK_SENTINEL|corrupt\.backup|Sentry/, file);
        if (file.includes('recovery/') || file.startsWith('storage/')) assert.doesNotMatch(text, /console\.(?:log|error|warn)\([^)]*(?:\.stack|\.message|\braw\b|\bvalue\b)|fetch\(|axios/, file);
    }
});
