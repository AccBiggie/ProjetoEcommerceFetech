const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const tools = import('../frontend/scripts/bundle-audit.mjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fetech-bundle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, '.vite'));
  fs.mkdirSync(path.join(directory, 'assets'));
  const contents = { 'assets/entry-XYZ.js': 'entryá', 'assets/app-XYZ.js': 'app', 'assets/shared-XYZ.js': 'shared', 'assets/admin-XYZ.js': 'admin', 'assets/app.css': 'css', 'assets/hero.webp': 'image' };
  for (const [file, body] of Object.entries(contents)) fs.writeFileSync(path.join(directory, file), body);
  const manifest = {
    'index.html': { file: 'assets/entry-XYZ.js', isEntry: true, imports: ['shared'], dynamicImports: ['src/App.jsx'] },
    'shared': { file: 'assets/shared-XYZ.js' },
    'src/App.jsx': { file: 'assets/app-XYZ.js', isDynamicEntry: true, src: 'src/App.jsx', imports: ['shared'], dynamicImports: ['src/component/Admin/Dashboard.jsx'], css: ['assets/app.css'], assets: ['assets/hero.webp'] },
    'src/component/Admin/Dashboard.jsx': { file: 'assets/admin-XYZ.js', isDynamicEntry: true, src: 'src/component/Admin/Dashboard.jsx', imports: ['shared'] },
  };
  const provenance = { 'assets/entry-XYZ.js': ['src/index.jsx'], 'assets/app-XYZ.js': ['src/App.jsx'], 'assets/shared-XYZ.js': [], 'assets/admin-XYZ.js': ['src/component/Admin/Dashboard.jsx'] };
  const save = () => { fs.writeFileSync(path.join(directory, '.vite/manifest.json'), JSON.stringify(manifest)); fs.writeFileSync(path.join(directory, '.vite/modules.json'), JSON.stringify(provenance)); };
  save();
  const budget = { limits: { initialJsGzip: 10000, entryJsGzip: 1000, largestRouteGzip: 1000, initialCssRaw: 1000 }, forbiddenInitialPrefixes: ['src/component/Admin/'], requiredLazySources: ['src/component/Admin/Dashboard.jsx'] };
  return { directory, contents, manifest, provenance, save, budget };
}
test('PERF manifest encontra entry sem depender do hash', async t => { const f = fixture(t); const r = (await tools).auditBundle(f.directory); assert.equal(r.initial.length, 3); assert.equal(r.routes[0].source, 'src/component/Admin/Dashboard.jsx'); });
test('PERF raw conta bytes UTF8 e gzip real determinístico', async t => { const f = fixture(t); const r = (await tools).auditBundle(f.directory); const a = r.initial.find(a => a.file.includes('entry')); assert.equal(a.raw, Buffer.byteLength(f.contents[a.file])); assert.equal(a.gzip, gzipSync(Buffer.from(f.contents[a.file])).length); assert.deepEqual(r.metrics, (await tools).auditBundle(f.directory).metrics); });
test('PERF bootstrap dinâmico App integra initial, Admin somente lazy', async t => { const f = fixture(t); const r = (await tools).auditBundle(f.directory); assert.ok(r.initial.some(a => a.file.includes('app'))); assert.equal(r.lazy.length, 1); assert.ok(r.lazy[0].file.includes('admin')); assert.deepEqual(r.routes[0].additionalFiles, ['assets/admin-XYZ.js']); });
test('PERF shared não é contado duas vezes e CSS é medido separado', async t => { const f = fixture(t); const r = (await tools).auditBundle(f.directory); assert.equal(r.metrics.initialJsRaw, 16); assert.equal(r.metrics.initialCssRaw, 3); });
test('PERF auditor somente leitura não modifica artefatos', async t => { const f = fixture(t); const before = JSON.stringify(fs.readdirSync(f.directory)); const content = fs.readFileSync(path.join(f.directory, '.vite/manifest.json')); (await tools).auditBundle(f.directory); assert.equal(JSON.stringify(fs.readdirSync(f.directory)), before); assert.deepEqual(fs.readFileSync(path.join(f.directory, '.vite/manifest.json')), content); });
test('PERF budget aprova build dentro do limite', async t => { const f = fixture(t); const tool = await tools; assert.doesNotThrow(() => tool.checkBudget(tool.auditBundle(f.directory), f.budget)); });
for (const metric of ['initialJsGzip', 'entryJsGzip', 'largestRouteGzip', 'initialCssRaw']) test('PERF budget menor reprova ' + metric, async t => { const f = fixture(t); const tool = await tools; f.budget.limits[metric] = 1; assert.throws(() => tool.checkBudget(tool.auditBundle(f.directory), f.budget), /reprovado/); });
test('PERF Admin eager é detectado pela proveniência, mesmo em shared', async t => { const f = fixture(t); f.provenance['assets/shared-XYZ.js'].push('src/component/Admin/AuditTrail.jsx'); f.save(); const tool = await tools; assert.throws(() => tool.checkBudget(tool.auditBundle(f.directory), f.budget), /Módulo proibido/); });
test('PERF rota obrigatória retirada reprova', async t => { const f = fixture(t); f.manifest['src/component/Admin/Dashboard.jsx'].isDynamicEntry = false; f.save(); const tool = await tools; assert.throws(() => tool.checkBudget(tool.auditBundle(f.directory), f.budget), /Rota lazy obrigatória/); });
for (const key of ['index.html', 'src/App.jsx', 'shared']) test('PERF chunk ausente falha fechado: ' + key, async t => { const f = fixture(t); delete f.manifest[key]; f.save(); const tool = await tools; assert.throws(() => tool.auditBundle(f.directory), /ausente/); });
test('PERF provenance ausente falha fechado', async t => { const f = fixture(t); delete f.provenance['assets/app-XYZ.js']; f.save(); const tool = await tools; assert.throws(() => tool.auditBundle(f.directory), /Proveniência ausente/); });
test('PERF budget vazio/inválido falha fechado', async t => { const f = fixture(t); const tool = await tools; const r = tool.auditBundle(f.directory); assert.throws(() => tool.checkBudget(r, {}), /obrigatória/); f.budget.limits.initialJsGzip = NaN; assert.throws(() => tool.checkBudget(r, f.budget), /inválido/); });
test('PERF path traversal em asset recusado', async t => { const f = fixture(t); f.manifest.shared.file = '../outside.js'; f.save(); const tool = await tools; assert.throws(() => tool.auditBundle(f.directory), /fora do build/); });
