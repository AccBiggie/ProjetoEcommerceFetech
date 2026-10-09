const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root } = require('./policy');
const parser = require(require.resolve('@babel/parser', { paths: [path.join(root, 'ecommerce/frontend')] }));
function checkPath(file, content = '') {
    const normalized = file.replaceAll('\\', '/');
    if (/(?:^|\/)[^/]*\.env(?:\.[^/]+)?$/.test(normalized) && !normalized.endsWith('.example')) throw new Error('Arquivo de ambiente real no índice.');
    if (/(?:\.archive\.gz|\.partial|\.bson|\.wt|\.pem|\.key|\.p12|\.pfx)$|(?:^|\/)(?:backup-manifest\.(?:json|sha256)|WiredTiger[^/]*|mongod\.log|\.test-state\.json|id_rsa|id_ed25519|credentials|secrets\.json|service-account[^/]*\.json)$|(?:^|\/)(?:backups|dump|node_modules|test-results|playwright-report|\.local|\.npm-cache)\/|(?:^|\/)frontend\/build\//i.test(normalized)) throw new Error('Artefato privado/gerado no índice.');
    if (normalized.endsWith('.env.example') || normalized.endsWith('config.env.example')) {
        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/^\s*(?:JWT_SECRET|PASSWORD|CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET|DB_URI)\s*=\s*(.*)$/);
            if (match && match[1].trim() && !/placeholder|change|replace|example|your|<|localhost|127\.0\.0\.1|defina|preencha/i.test(match[1])) throw new Error('Example com valor sensível não reconhecido como placeholder.');
        }
    }
}
function checkTestSource(file, source) {
    const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
    const forbiddenAliases = new Set();
    function aliases(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern' && ['test', 'it', 'describe'].includes(node.init?.name)) {
            for (const property of node.id.properties) if (['only', 'skip', 'todo', 'fixme'].includes(property.key?.name || property.key?.value)) forbiddenAliases.add(property.value.name);
        }
        if (node.type === 'VariableDeclarator' && node.init?.type === 'MemberExpression' && ['only', 'skip', 'todo', 'fixme'].includes(node.init.property.name || node.init.property.value)) forbiddenAliases.add(node.id.name);
        for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(aliases); else if (value && typeof value === 'object') aliases(value);
    }
    aliases(ast.program);
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && forbiddenAliases.has(node.callee?.name)) throw new Error('Alias de teste focado/incompleto proibido.');
        if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
            const member = node.callee, name = member.computed ? member.property.value : member.property.name;
            if (name === 'only') throw new Error('Teste focado proibido.');
            let receiver = member.object;
            while (receiver?.type === 'MemberExpression') receiver = receiver.object;
            if (['skip', 'todo', 'fixme', 'fail'].includes(name) && ['test', 'it', 'describe', 't', 'context'].includes(receiver?.name)) {
                const permitted = file === 'ecommerce/tests/backupRestore.test.js' && name === 'skip' && member.object.name === 't' && node.arguments.length === 1 && node.arguments[0].value === 'MongoDB Database Tools ausentes: restore real bloqueado.';
                if (!permitted) throw new Error('Skip/todo/falha esperada não autorizada.');
            }
        }
        if (node.type === 'CallExpression' && ['test', 'it', 'describe'].includes(node.callee?.name)) {
            for (const argument of node.arguments) if (argument.type === 'ObjectExpression') for (const property of argument.properties) {
                if (['skip', 'todo', 'only'].includes(property.key?.name || property.key?.value) && property.value?.value !== false) throw new Error('Opção de teste incompleta/focada proibida.');
            }
        }
        for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
    walk(ast.program);
}
function repositorySafety(cwd = root) {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd }).toString().split('\0').filter(Boolean);
    for (const file of files) {
        checkPath(file);
        // Scan staged examples as well as the working copy. Never display their values.
        if (file.endsWith('.env.example') || file.endsWith('config.env.example')) {
            checkPath(file, execFileSync('git', ['show', ':' + file], { cwd }).toString());
            if (fs.existsSync(path.join(cwd, file))) checkPath(file, fs.readFileSync(path.join(cwd, file), 'utf8'));
        }
    }
    // Include new local test files before they have been staged, without changing the index.
    const tests = path.join(cwd, 'ecommerce/tests');
    function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(?:js|mjs|jsx)$/.test(entry.name)) checkTestSource(path.relative(cwd, full).replaceAll('\\', '/'), fs.readFileSync(full, 'utf8')); } }
    if (fs.existsSync(tests)) walk(tests);
    return files.length;
}
function diffRange(cwd, event = {}) {
    const git = args => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const sha = value => /^[a-f0-9]{40}$/.test(value || '');
    if (event.pull_request) {
        const base = event.pull_request.base?.sha;
        if (!sha(base)) throw new Error('Base PR inválida.');
        return [git(['merge-base', base, 'HEAD']), 'HEAD'];
    }
    if (event.before && !/^0+$/.test(event.before)) {
        if (!sha(event.before)) throw new Error('Before inválido.');
        git(['cat-file', '-e', event.before + '^{commit}']); return [event.before, 'HEAD'];
    }
    try { return [git(['rev-parse', 'HEAD^']), 'HEAD']; }
    catch { return [git(['hash-object', '-t', 'tree', '--stdin']), 'HEAD']; }
}
function diffCheck(cwd = root, event) {
    const args = event ? ['diff', '--check', ...diffRange(cwd, event)] : ['diff', '--check', 'HEAD'];
    execFileSync('git', args, { cwd, stdio: 'inherit' });
}
module.exports = { checkPath, checkTestSource, repositorySafety, diffRange, diffCheck };
