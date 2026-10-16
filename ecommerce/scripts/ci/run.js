const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { root, app, aggregate } = require('./policy');
const { repositorySafety, diffCheck } = require('./repository');
function run(args, cwd = app, timeout = 25 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Timeout do gate.')); }, timeout);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Comando falhou (${code}).`)); });
    });
}
function npm(args, cwd = app) {
    const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!fs.existsSync(cli)) throw new Error('Execute este gate via npm.');
    return run([cli, ...args], cwd);
}
const stages = {
    'repo-safety': async () => {
        console.log(`Repo safety: ${repositorySafety()} arquivos versionados verificados.`);
        diffCheck(root, process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : undefined);
    },
    architecture: () => run(['--test', 'tests/frontendPerformanceArchitecture.test.js', 'tests/frontendBundleBudget.test.js', 'tests/frontendAccessibilityArchitecture.test.js', 'tests/frontendStorageArchitecture.test.js', 'tests/backendArchitecture.test.js', 'tests/ciCommercialGate.test.js', 'tests/ciRepositorySafety.test.js']),
    api: () => npm(['test']),
    build: async () => { await npm(['run', 'build'], path.join(app, 'frontend')); await npm(['run', 'ci:bundle-budget'], path.join(app, 'frontend')); },
    e2e: () => npm(['run', 'test:e2e']),
    audit: async () => { await npm(['audit', '--audit-level=high']); await npm(['audit', '--audit-level=high'], path.join(app, 'frontend')); },
    aggregate: async () => aggregate(JSON.parse(process.env.NEEDS_JSON || '{}')),
};
async function sequence(entries) { for (const [name, action] of entries) { console.log(`\nCommercial Gate: ${name}`); await action(); } }
async function main(stage) {
    if (stage === 'commercial') await sequence(['repo-safety', 'architecture', 'api', 'build', 'e2e', 'audit'].map(name => [name, stages[name]]));
    else if (stages[stage]) await stages[stage](); else throw new Error('Gate desconhecido.');
}
if (require.main === module) main(process.argv[2]).then(() => console.log('Gate aprovado.')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run, main, sequence };
