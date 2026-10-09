const { spawn, spawnSync } = require('node:child_process');
const { startReplicaSet } = require('./replicaSetHarness');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { root, app, assertRunnerEnvironment } = require('../scripts/ci/policy');
async function main() {
    assertRunnerEnvironment(process.env);
    require('../scripts/ci/repository').repositorySafety();
    await fs.mkdir(path.join(root, '.local'), { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, '.local/test-run-'));
    const id = crypto.randomBytes(16).toString('hex');
    let mongo, child, interrupted = false;
    const shutdown = () => {
        interrupted = true;
        if (!child?.pid || child.exitCode !== null) return;
        if (process.platform === 'win32') {
            const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            if (result.status !== 0) child.kill('SIGTERM');
        }
        else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
    };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    try {
        mongo = await startReplicaSet();
        const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
        const args = process.argv.slice(2);
        child = spawn(process.execPath, args.length ? args : ['--test', '--test-concurrency=4', '--test-reporter=./scripts/ci/apiReporter.js', 'tests/*.test.js'], {
            cwd: app, windowsHide: true, detached: process.platform !== 'win32', stdio: 'inherit',
            env: { ...process.env, FETECH_TEST_MONGO_BASE: mongo.base, FETECH_TEST_RUN_ID: id, FETECH_TEST_RUN_DIR: directory, FETECH_E2E_ORIGIN: `http://127.0.0.1:${port}` },
        });
        const timer = setTimeout(shutdown, 20 * 60 * 1000);
        try { const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); }); return interrupted ? 1 : code; }
        finally { clearTimeout(timer); }
    } finally {
        process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); await mongo?.stop();
        if (path.dirname(directory) !== path.join(root, '.local') || !path.basename(directory).startsWith('test-run-')) throw new Error('Cleanup fora do contexto.');
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
}
main().then(code => { process.exitCode = code; }).catch(() => { console.error('Runner indisponível: exige mongod local para replica set isolado.'); process.exitCode = 1; });
