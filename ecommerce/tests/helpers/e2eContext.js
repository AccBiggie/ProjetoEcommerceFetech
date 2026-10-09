const path = require('node:path');
const { root } = require('../../scripts/ci/policy');
function context(env = process.env) {
    if (!/^[a-f0-9]{32}$/.test(env.FETECH_TEST_RUN_ID || '')) throw new Error('E2E exige runner isolado.');
    const directory = path.resolve(env.FETECH_TEST_RUN_DIR || '.');
    if (path.dirname(directory) !== path.join(root, '.local') || !path.basename(directory).startsWith('test-run-')) throw new Error('Diretório E2E não pertencente ao runner.');
    const origin = new URL(env.FETECH_E2E_ORIGIN || '');
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || ['3000', '3300', '4000'].includes(origin.port) || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Host E2E externo/fixo proibido.');
    return { directory, state: path.join(directory, 'state.json'), origin: origin.origin, port: Number(origin.port) };
}
module.exports = { context };
