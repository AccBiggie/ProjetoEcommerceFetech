const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkPath, checkTestSource, repositorySafety, diffCheck, diffRange } = require('../scripts/ci/repository');
for (const file of ['ecommerce/backend/config/config.env', '.env.production', 'backup/database.archive.gz', 'backup/backup-manifest.json', 'backup/backup-manifest.sha256', 'anything.partial', 'data/WiredTiger', 'data/users.bson', 'private.key', 'ecommerce/.test-state.json']) test('CI índice recusa ' + file, () => assert.throws(() => checkPath(file)));
test('CI example seguro permitido e secret em example rejeitado', () => { assert.doesNotThrow(() => checkPath('config.env.example', 'JWT_SECRET=<gere>\nDB_URI=mongodb://127.0.0.1:27017/fetech')); assert.throws(() => checkPath('config.env.example', 'JWT_SECRET=real-looking-sensitive-value')); });
for (const source of ["test.only('x',()=>{})", "test['only']('x',()=>{})", "describe.only('x',()=>{})", "test('x',{only:true},()=>{})", "test.skip('x',()=>{})", "test('x',{skip:true},()=>{})", "test.todo('x')", "test.fixme('x',()=>{})"]) test('CI AST bloqueia foco/incompleto: ' + source, () => assert.throws(() => checkTestSource('ecommerce/tests/x.test.js', source)));
test('CI AST ignora comentários e strings de fixtures', () => assert.doesNotThrow(() => checkTestSource('ecommerce/tests/x.test.js', "// test.only('x')\nconst fixture=\"test.skip('x')\"; test('normal',()=>{});")));
test('CI AST exceção F024 é limitada ao arquivo e motivo', () => {
    const source = "t.skip('MongoDB Database Tools ausentes: restore real bloqueado.');";
    assert.doesNotThrow(() => checkTestSource('ecommerce/tests/backupRestore.test.js', source)); assert.throws(() => checkTestSource('ecommerce/tests/x.test.js', source));
});
test('CI AST bloqueia aliases de only/skip', () => { for (const source of ["const {only:focus}=test;focus('x',()=>{})", "const focus=test.only;focus('x',()=>{})"]) assert.throws(() => checkTestSource('ecommerce/tests/x.test.js', source)); });
function fixture(fn) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fetech-ci-git-'));
    const git = args => execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    try { git(['init', '--initial-branch=main']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']); return fn(cwd, git); }
    finally { assert.equal(path.dirname(cwd), os.tmpdir()); assert.ok(path.basename(cwd).startsWith('fetech-ci-git-')); fs.rmSync(cwd, { recursive: true, force: true }); }
}
test('CI repo scanner usa índice fake sem alterar índice real', () => fixture((cwd, git) => { fs.writeFileSync(path.join(cwd, 'config.env'), 'JWT_SECRET=fixture'); git(['add', 'config.env']); assert.throws(() => repositorySafety(cwd)); }));
test('CI diff detecta whitespace commitado e passa mudança limpa', () => fixture((cwd, git) => {
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'base\n'); git(['add', '.']); git(['commit', '-m', 'base']); const before = git(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'trailing  \n'); git(['add', '.']); git(['commit', '-m', 'dirty']); assert.throws(() => diffCheck(cwd, { before }));
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'clean\n'); git(['add', '.']); git(['commit', '-m', 'clean']); assert.doesNotThrow(() => diffCheck(cwd, { before })); assert.equal(diffRange(cwd, { pull_request: { base: { sha: before } } })[0], before);
    assert.throws(() => diffRange(cwd, { before: 'invalid' }));
}));
