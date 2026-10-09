const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { MongoClient } = require('mongoose').mongo;
const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function testUri(database) {
    if (!/^fetech_[a-z][a-z0-9_]*_\d+_\d+$/.test(database)) throw new Error('Database de teste inválida.');
    if (!process.env.FETECH_TEST_MONGO_BASE) throw new Error('Use o runner de replica set isolado.');
    const url = require('../scripts/ci/policy').assertTestBase(process.env.FETECH_TEST_MONGO_BASE, process.env.FETECH_TEST_RUN_ID);
    url.pathname = '/' + database;
    return url.toString();
}
async function startReplicaSet({ standalone = false } = {}) {
    await fs.mkdir(path.join(root, '.local'), { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, '.local/test-mongo-rs-'));
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
    const executable = process.env.FETECH_TEST_MONGOD || (process.platform === 'win32' ? path.join(root, '.local/mongod.exe') : 'mongod');
    const args = ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', directory, '--logpath', path.join(directory, 'mongod.log')];
    if (!standalone) args.push('--replSet', 'fetech_test_rs');
    const child = spawn(executable, args, { windowsHide: true, stdio: 'ignore' });
    let launchError;
    child.on('error', error => { launchError = error; });
    const closed = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    const direct = new MongoClient(`mongodb://127.0.0.1:${port}/admin?directConnection=true`, { serverSelectionTimeoutMS: 500 });
    const stop = async () => {
        await direct.close();
        if (child.exitCode === null && !launchError) { child.kill(); await closed; }
        const resolved = path.resolve(directory);
        if (path.dirname(resolved) !== path.join(root, '.local') || !path.basename(resolved).startsWith('test-mongo-rs-')) throw new Error('Teardown fora do diretório temporário.');
        await fs.rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    };
    try {
        const deadline = Date.now() + 45000;
        while (true) {
            if (launchError || child.exitCode !== null) throw new Error('mongod de teste indisponível.');
            try { await direct.connect(); await direct.db().command({ ping: 1 }); break; } catch { if (Date.now() > deadline) throw new Error('Timeout do Mongo isolado.'); await sleep(150); }
        }
        if (!standalone) {
            await direct.db().command({ replSetInitiate: { _id: 'fetech_test_rs', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
            while (!(await direct.db().command({ hello: 1 })).isWritablePrimary) { if (Date.now() > deadline) throw new Error('Primary indisponível.'); await sleep(150); }
        }
        await direct.close();
        return { base: `mongodb://127.0.0.1:${port}/admin${standalone ? '' : '?replicaSet=fetech_test_rs'}`, port, directory, stop };
    } catch (error) { await stop(); throw error; }
}
module.exports = { startReplicaSet, testUri };
