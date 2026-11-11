const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../frontend/node_modules/@babel/parser');
const root = path.resolve(__dirname, '../frontend');
function imports(file) {
  const ast = parser.parse(fs.readFileSync(path.join(root, file), 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  return ast.program.body.filter(n => n.type === 'ImportDeclaration').map(n => n.source.value);
}
test('PERF Admin não integra imports estáticos do router', () => { assert.ok(!imports('src/routes.jsx').some(i => i.includes('/Admin/'))); });
test('PERF abas secundárias do painel usam imports dinâmicos literais', () => {
  const file = 'src/component/Admin/Dashboard.jsx'; assert.ok(!imports(file).some(i => /AuditTrail|PrivacyRequests/.test(i)));
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const component of ['AuditTrail', 'PrivacyRequests']) assert.match(source, new RegExp("lazy\\(\\(\\) => import\\('\\./" + component + "'\\)\\)"));
  assert.match(source, /Suspense fallback=\{<Loader/);
});
test('PERF busca submit permanece sem efeito de rede e sem TextField pesado', () => {
  assert.ok(!imports('src/component/Product/Search.jsx').some(i => i.includes('AccessibleTextField')));
  assert.match(fs.readFileSync(path.join(root, 'src/component/Product/Search.jsx'), 'utf8'), /onSubmit/);
});
test('PERF budget roda no estágio build e arquitetura permanente', () => {
  const source = fs.readFileSync(path.join(root, '../scripts/ci/run.js'), 'utf8');
  assert.match(source, /await npm\(\['run', 'build'\]/); assert.match(source, /ci:bundle-budget/);
  assert.match(source, /frontendPerformanceArchitecture\.test\.js/); assert.match(source, /frontendBundleBudget\.test\.js/);
});
test('PERF dedupe e stale guards protegem os thunks reais', () => {
  const source = fs.readFileSync(path.join(root, 'src/actions/productAction.js'), 'utf8');
  assert.match(source, /const listRead = latestRead\(\)/); assert.match(source, /const detailRead = latestRead\(\)/);
  assert.match(source, /listRead\(link, dispatch/); assert.match(source, /detailRead\(id, dispatch/);
  assert.equal((source.match(/if \(!isCurrent\(\)\) return/g) || []).length, 4);
});
test('PERF remount de leitura idêntica compartilha somente request pendente', async () => {
  const { latestRead } = await import('../frontend/src/utils/latestRead.mjs'); const run = latestRead(), owner = {};
  let release, calls = 0; const pending = new Promise(resolve => release = resolve);
  const read = async () => { calls++; await pending; return 'ok'; };
  const first = run('page1', owner, read), second = run('page1', owner, read);
  assert.equal(first, second); release(); assert.equal(await first, 'ok'); assert.equal(calls, 1);
  await run('page1', owner, read); assert.equal(calls, 2); // No completed-response cache.
});
test('PERF mudança de página aborta anterior e impede resposta antiga', async () => {
  const { latestRead } = await import('../frontend/src/utils/latestRead.mjs'); const run = latestRead(), owner = {};
  let release, oldSignal; const pending = new Promise(resolve => release = resolve); const accepted = [];
  const old = run('page1', owner, async (signal, isCurrent) => { oldSignal = signal; await pending; if (isCurrent()) accepted.push('old'); });
  await Promise.resolve(); await run('page2', owner, async (_, isCurrent) => { if (isCurrent()) accepted.push('new'); });
  release(); await old; assert.equal(oldSignal.aborted, true); assert.deepEqual(accepted, ['new']);
});
test('PERF falha libera leitura para retry e owners distintos não deduplicam', async () => {
  const { latestRead } = await import('../frontend/src/utils/latestRead.mjs'); const run = latestRead(), owner = {};
  await assert.rejects(run('a', owner, async () => { throw Error('failed'); }));
  assert.equal(await run('a', owner, async () => 2), 2);
  const a = run('a', {}, async () => 3), b = run('a', {}, async () => 4); assert.notEqual(a, b); await Promise.all([a, b]);
});
