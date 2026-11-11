const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../frontend');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []); }
test('SEO head possui uma autoridade e não importa estado privado ou origem do navegador', () => {
  for (const file of files(path.join(root, 'src'))) {
    if (file.endsWith(path.join('seo', 'head.mjs'))) continue;
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /document\.title\s*=|document\.head\.(append|querySelector)|<title[\s>]|<meta[\s>]|rel=["']canonical/, path.relative(root, file));
  }
  const helper = fs.readFileSync(path.join(root, 'src/seo/metadata.mjs'), 'utf8');
  assert.doesNotMatch(helper, /window\.location|location\.origin|from ['"].*(?:store|userAction|orderAction)|product\.(?:user|reviews|email)/);
});
test('SEO build inicial seguro e sem identidade CRA; robots não bloqueia noindex', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal([...html.matchAll(/<title>/g)].length, 1); assert.equal([...html.matchAll(/name="description"/g)].length, 1);
  assert.doesNotMatch(html, /noindex|rel="canonical"|property="og:/);
  const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8'); assert.doesNotMatch(robots, /Disallow:\s*\/|Sitemap:/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'), /React App|Create React App/);
});
test('SEO audit offline e gate permanentes', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/seo-audit.mjs'), 'utf8');
  assert.doesNotMatch(script, /fetch\(|mongoose|https?\.get|config\.env/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts['audit:seo'], 'node scripts/seo-audit.mjs');
  const ci = fs.readFileSync(path.join(__dirname, '../scripts/ci/run.js'), 'utf8');
  for (const marker of ['frontendSeo.test.js', 'frontendSeoArchitecture.test.js', 'audit:seo']) assert.ok(ci.includes(marker));
});
