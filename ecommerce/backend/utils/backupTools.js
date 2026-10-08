const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fail, BackupError } = require('./backupContract');
async function runTool(executable, args, { signal, capture = false } = {}) {
    return new Promise((resolve, reject) => {
        let output = '';
        const child = spawn(executable, args, { shell: false, windowsHide: true, signal, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'] });
        if (capture) child.stdout.on('data', chunk => { if (output.length < 8192) output += chunk.toString(); });
        child.once('error', () => reject(new BackupError('BACKUP_TOOL_UNAVAILABLE', 'MongoDB Database Tools indisponíveis ou operação cancelada. Instale as ferramentas oficiais ou informe --tools-dir.')));
        child.once('close', code => code === 0 ? resolve(output) : reject(Object.assign(new Error('MongoDB Database Tools falharam; backup/restore não validado.'), { code: 'BACKUP_TOOL_FAILED', exitCode: code })));
    });
}
async function discoverTools(directory) {
    const tools = {};
    for (const name of ['mongodump', 'mongorestore']) {
        const executable = directory ? path.join(path.resolve(directory), name + (process.platform === 'win32' ? '.exe' : '')) : name;
        const result = await runTool(executable, ['--version'], { capture: true });
        const version = result.match(new RegExp(name + ' version: ([0-9]+\\.[0-9]+\\.[0-9]+)'))?.[1];
        if (!version || !version.startsWith('100.') || Number(version.split('.')[1]) < 3) fail('BACKUP_TOOL_VERSION', 'Database Tools oficiais 100.3+ (série 100.x) são obrigatórias para --config. Informe --tools-dir ou configure PATH.');
        tools[name] = { executable, version };
    }
    return tools;
}
async function toolConnection(uri, action) {
    // Official --config keeps credentials out of process arguments and dump artifacts.
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fetech-tools-config-'));
    try {
        await fs.chmod(directory, 0o700);
        const file = path.join(directory, 'connection.yml');
        await fs.writeFile(file, 'uri: ' + JSON.stringify(uri) + '\n', { flag: 'wx', mode: 0o600 });
        return await action(file);
    } finally {
        const resolved = path.resolve(directory);
        if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('fetech-tools-config-')) fail('BACKUP_TEMP_PATH', 'Diretório temporário fora do limite autorizado.');
        await fs.rm(resolved, { recursive: true, force: true });
    }
}
module.exports = { runTool, discoverTools, toolConnection };
