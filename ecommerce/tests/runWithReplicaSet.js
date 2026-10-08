const { spawn } = require('node:child_process');
const { startReplicaSet } = require('./replicaSetHarness');
async function main() {
    const mongo = await startReplicaSet();
    let child;
    const shutdown = () => child?.kill();
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    try {
        const args = process.argv.slice(2);
        child = spawn(process.execPath, args.length ? args : ['--test', '--test-concurrency=4', 'tests/*.test.js'], {
            cwd: require('node:path').resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit',
            env: { ...process.env, FETECH_TEST_MONGO_BASE: mongo.base },
        });
        return await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
    } finally { process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); await mongo.stop(); }
}
main().then(code => { process.exitCode = code; }).catch(() => { console.error('Runner indisponível: exige mongod local para replica set isolado.'); process.exitCode = 1; });
