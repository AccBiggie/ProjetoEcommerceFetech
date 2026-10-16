import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function auditBundle(directory, options = {}) {
  const bootEntries = options.bootEntries ?? ['index.html', 'src/App.jsx'];
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
  const provenance = JSON.parse(fs.readFileSync(path.join(directory, '.vite/modules.json'), 'utf8'));
  if (!manifest['index.html']?.isEntry) throw new Error('Entry HTML ausente.');
  const resolve = key => {
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== 'string') throw new Error('Chunk esperado ausente: ' + key);
    return chunk;
  };
  const closure = roots => {
    const seen = new Set();
    const visit = key => { if (seen.has(key)) return; seen.add(key); for (const next of resolve(key).imports ?? []) visit(next); };
    roots.forEach(visit);
    return [...seen];
  };
  const measure = file => {
    const target = path.resolve(directory, file);
    if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error('Asset fora do build.');
    const bytes = fs.readFileSync(target);
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const initialKeys = closure(bootEntries);
  const initialFiles = new Set(initialKeys.map(key => resolve(key).file));
  const js = [...new Set(Object.values(manifest).map(chunk => chunk.file).filter(file => file.endsWith('.js')))];
  const assets = [...new Set(Object.values(manifest).flatMap(chunk => [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]))].map(measure);
  const initial = assets.filter(asset => initialFiles.has(asset.file));
  const initialCss = [...new Set(initialKeys.flatMap(key => resolve(key).css ?? []))].map(measure);
  const lazy = assets.filter(asset => asset.file.endsWith('.js') && !initialFiles.has(asset.file));
  const routes = Object.entries(manifest).filter(([, chunk]) => chunk.isDynamicEntry && !bootEntries.includes(chunk.src)).map(([key, chunk]) => {
    const files = closure([key]).map(k => resolve(k).file);
    return { source: chunk.src, file: chunk.file, ...measure(chunk.file), additionalFiles: files.filter(file => !initialFiles.has(file)) };
  });
  const initialModules = initial.flatMap(asset => {
    if (!Array.isArray(provenance[asset.file])) throw new Error('Proveniência ausente: ' + asset.file);
    return provenance[asset.file];
  });
  const sum = (list, field) => list.reduce((total, asset) => total + asset[field], 0);
  const entry = measure(resolve('index.html').file);
  const metrics = { initialJsRaw: sum(initial, 'raw'), initialJsGzip: sum(initial, 'gzip'), entryJsGzip: entry.gzip,
    initialCssRaw: sum(initialCss, 'raw'), initialCssGzip: sum(initialCss, 'gzip'), largestLazyGzip: Math.max(0, ...lazy.map(a => a.gzip)),
    largestRouteGzip: Math.max(0, ...routes.map(a => a.gzip)), initialChunkCount: initial.length, totalJsChunks: js.length,
    adminRouteGzip: Math.max(0, ...routes.filter(a => a.source?.startsWith('src/component/Admin/')).map(a => a.gzip)),
    largestImageRaw: Math.max(0, ...assets.filter(a => /\.(png|webp|avif|jpe?g)$/.test(a.file)).map(a => a.raw)) };
  const knownFiles = new Set(assets.map(asset => asset.file));
  const publicAssets = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.vite') continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const file = path.relative(directory, full).replaceAll('\\', '/');
        if (!knownFiles.has(file)) publicAssets.push(measure(file));
      }
    }
  };
  walk(directory);
  return { bootEntries, metrics, initial, initialCss, routes, lazy, assets: assets.sort((a, b) => b.raw - a.raw), publicAssets, initialModules, provenance };
}

export function checkBudget(report, budget) {
  const failures = [];
  for (const name of ['initialJsGzip', 'entryJsGzip', 'largestRouteGzip', 'initialCssRaw']) {
    if (!Object.hasOwn(budget.limits ?? {}, name)) throw new Error('Métrica obrigatória ausente: ' + name);
  }
  for (const [name, max] of Object.entries(budget.limits ?? {})) {
    if (!Number.isSafeInteger(max) || max <= 0 || !Number.isFinite(report.metrics[name])) throw new Error('Budget inválido: ' + name);
    if (report.metrics[name] > max) failures.push(`${name}: ${report.metrics[name]} > ${max}`);
  }
  for (const prefix of budget.forbiddenInitialPrefixes ?? []) {
    if (report.initialModules.some(module => module.startsWith(prefix))) failures.push('Módulo proibido no payload inicial: ' + prefix);
  }
  for (const source of budget.requiredLazySources ?? []) {
    if (!report.routes.some(route => route.source === source)) failures.push('Rota lazy obrigatória ausente: ' + source);
  }
  if (failures.length) throw new Error('Bundle budget reprovado:\n' + failures.join('\n'));
  return report.metrics;
}

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = auditBundle(path.join(frontend, 'build'));
    if (process.argv.includes('--check')) checkBudget(report, JSON.parse(fs.readFileSync(path.join(frontend, 'bundle-budget.json'), 'utf8')));
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('Bundle local READ_ONLY. Bytes raw/gzip; bootstrap App incluso no initial.');
      console.table(report.metrics);
      console.log('Initial JS/CSS'); console.table([...report.initial, ...report.initialCss]);
      console.log('Route chunks'); console.table(report.routes.map(({ source, file, raw, gzip }) => ({ source, file, raw, gzip })));
      console.log('Largest assets (manifest + public)'); console.table([...report.assets, ...report.publicAssets].sort((a, b) => b.raw - a.raw).slice(0, 8));
      if (process.argv.includes('--check')) console.log('Bundle budget aprovado.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
