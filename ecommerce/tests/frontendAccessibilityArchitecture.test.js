const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../frontend/node_modules/@babel/parser');
const root = path.resolve(__dirname, '../frontend/src');
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith('.jsx') ? [path.join(directory, entry.name)] : []); }
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value && typeof value === 'object') walk(value, visit); }
}
for (const file of files(root)) test('F033 AST controles nativos e sem tabindex positivo: ' + path.relative(root, file).replaceAll('\\', '/'), () => {
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  walk(ast, node => {
    if (node.type !== 'JSXOpeningElement') return;
    const name = node.name.name;
    const attrs = Object.fromEntries(node.attributes.filter(attr => attr.type === 'JSXAttribute').map(attr => [attr.name.name, attr.value]));
    const tab = attrs.tabIndex;
    if (tab?.type === 'StringLiteral') assert.ok(Number(tab.value) <= 0, file);
    if (tab?.expression?.type === 'NumericLiteral') assert.ok(tab.expression.value <= 0, file);
    if (['div', 'span'].includes(name)) assert.equal(Object.hasOwn(attrs, 'onClick'), false, file);
    if (name === 'IconButton') assert.ok(attrs['aria-label'] || attrs['aria-labelledby'], file);
  });
});
test('F033 axe sem suppression e gate permanente', () => {
  const helper = fs.readFileSync(path.join(__dirname, 'helpers/accessibility.js'), 'utf8');
  assert.doesNotMatch(helper, /disableRules|\.exclude\(|withRules|withTags/);
  assert.match(helper, /new AxeBuilder/); assert.match(helper, /toEqual\(\[\]\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '../scripts/ci/run.js'), 'utf8'), /frontendAccessibilityArchitecture\.test\.js/);
});
test('F033 idioma e reduced motion preservados', () => {
  assert.match(fs.readFileSync(path.join(root, '../index.html'), 'utf8'), /lang="pt-BR"/);
  const css = fs.readFileSync(path.join(root, 'App.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/); assert.match(css, /focus-visible[^}]+outline:/);
});
