const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { login, settle, expectNoA11yViolations } = require('../helpers/accessibility');
const { installSecurityChecks } = require('./securityChecks');
installSecurityChecks(test, expect);
const build = path.resolve(__dirname, '../../frontend/build');
const manifest = JSON.parse(fs.readFileSync(path.join(build, '.vite/manifest.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(build, '.vite/modules.json'), 'utf8'));
const asset = source => '/' + manifest[source].file;
const admin = Object.entries(provenance).filter(([, modules]) => modules.some(m => m.startsWith('src/component/Admin/'))).map(([file]) => '/' + file);
const network = page => page.evaluate(() => performance.getEntriesByType('resource').map(e => ({ path: new URL(e.name).pathname, type: e.initiatorType })));
const states = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; states.set(page, errors);
  page.on('pageerror', error => errors.push(error.name));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource.*401/.test(message.text())) errors.push(message.text().slice(0, 80)); });
  // All fixtures/providers are local. An external request is a test failure.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { errors.push('EXTERNAL_REQUEST'); return route.abort(); }
    return route.continue();
  });
});
test.afterEach(async ({ page }) => { expect(states.get(page)).toEqual([]); });
for (const width of [360, 1440]) test('PERF Home pública rede/imagens/LCP policy ' + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    window.__lab = { lcp: [], cls: 0 };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lab.lcp.push({ ms: e.startTime, tag: e.element?.tagName, alt: e.element?.getAttribute('alt') }); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__lab.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/'); await settle(page);
  await expect(page.locator('.productCard').first()).toBeVisible();
  const resources = await network(page);
  expect(resources.filter(r => admin.includes(r.path))).toEqual([]);
  expect(resources.filter(r => r.path === '/api/v1/products')).toHaveLength(1);
  expect(resources.filter(r => r.path.startsWith('/api/v1/admin/'))).toEqual([]);
  const hero = page.getByAltText('Hardware e equipamentos Fetech');
  await expect(hero).toHaveAttribute('loading', 'eager'); await expect(hero).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
  const images = await page.locator('.productCard img').evaluateAll(nodes => nodes.map(e => ({ loading: e.loading, decoding: e.decoding, alt: e.alt, top: e.getBoundingClientRect().top, containerHeight: e.parentElement.getBoundingClientRect().height })));
  expect(images.length).toBeGreaterThan(0); expect(images.some(i => i.top > 900)).toBe(true);
  expect(images.every(i => i.loading === 'lazy' && i.decoding === 'async' && i.alt && i.containerHeight >= 200)).toBe(true);
  await expectNoA11yViolations(page, 'PERF Home');
  await info.attach('perf-home-' + width, { body: JSON.stringify({ width, resources, images, lab: await page.evaluate(() => window.__lab) }), contentType: 'application/json' });
});
test('PERF Admin e abas somente sob demanda; listagem ativa sem refetch das demais', async ({ page }, info) => {
  await login(page, 'admin'); await page.goto('/'); await settle(page);
  let resources = await network(page); expect(resources.filter(r => admin.includes(r.path))).toEqual([]);
  const calls = []; page.on('request', r => { const url = new URL(r.url()); if (url.pathname.startsWith('/api/v1/admin/')) calls.push({ path: url.pathname, page: url.searchParams.get('page') }); });
  await page.evaluate(() => { history.pushState({}, '', '/dashboard'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Painel administrativo', exact: true })).toBeVisible(); await settle(page);
  resources = await network(page);
  expect(resources.some(r => r.path === asset('src/component/Admin/Dashboard.jsx'))).toBe(true);
  expect(resources.some(r => r.path === asset('src/component/Admin/AuditTrail.jsx'))).toBe(false);
  expect(resources.some(r => r.path === asset('src/component/Admin/PrivacyRequests.jsx'))).toBe(false);
  expect(calls.map(r => r.path)).toEqual(['/api/v1/admin/products']);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await expect(page).toHaveTitle('Painel administrativo | Fetech');
  await page.getByRole('tab', { name: 'Usuários', exact: true }).click(); await settle(page);
  await page.getByLabel('Filtrar usuários').selectOption('all'); await settle(page);
  expect(calls.filter(r => r.path === '/api/v1/admin/products')).toHaveLength(1);
  expect(calls.filter(r => r.path === '/api/v1/admin/users')).toHaveLength(2);
  expect(calls.filter(r => r.path === '/api/v1/admin/orders')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Auditoria', exact: true }).click(); await settle(page);
  expect((await network(page)).some(r => r.path === asset('src/component/Admin/AuditTrail.jsx'))).toBe(true);
  await expectNoA11yViolations(page, 'PERF audit lazy');
  await page.getByRole('tab', { name: 'Privacidade', exact: true }).click(); await settle(page);
  expect((await network(page)).some(r => r.path === asset('src/component/Admin/PrivacyRequests.jsx'))).toBe(true);
  await expectNoA11yViolations(page, 'PERF privacy lazy');
  await info.attach('perf-admin', { body: JSON.stringify({ resources: await network(page), calls }), contentType: 'application/json' });
});
test('PERF Login não carrega Admin; fallback lazy mantém shell, status e foco', async ({ page }) => {
  let release; const blocked = new Promise(resolve => release = resolve);
  await page.route('**' + asset('src/component/User/LoginSignUp.jsx'), async route => { await blocked; await route.continue(); });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status').filter({ hasText: 'Carregando...' })).toBeVisible(); await expect(page.getByRole('banner')).toBeVisible();
  await expectNoA11yViolations(page, 'PERF fallback');
  release(); await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible(); await settle(page);
  await expect(page).toHaveTitle('Bem-vindo de volta | Fetech');
  expect((await network(page)).filter(r => admin.includes(r.path))).toEqual([]);
  await expectNoA11yViolations(page, 'PERF login');
  await page.getByRole('link', { name: 'Fetech, página inicial' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Seu próximo setup');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.goBack(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Seu próximo setup');
  await page.goForward(); await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});
test('PERF Product detalhe request única, imagens e chunk sem Admin', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const link = page.locator('.productCard').first(); const href = await link.getAttribute('href');
  const calls = []; page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1' + href) calls.push(r); });
  await page.route('**/api/v1' + href, async route => {
    const reply = await route.fetch(); const data = await reply.json();
    data.product.images.push({ public_id: 'local-gallery-fixture', url: '/Profile.png' });
    await route.fulfill({ response: reply, json: data });
  });
  await link.click(); await expect(page.locator('.ProductDetails')).toBeVisible(); await settle(page);
  expect(calls).toHaveLength(1);
  await expect(page.locator('.productCarousel img').first()).toHaveAttribute('loading', 'eager');
  await expect(page.locator('.productCarousel img').first()).toHaveAttribute('decoding', 'async');
  await expect(page.locator('.productCarousel img').nth(1)).toHaveAttribute('loading', 'lazy');
  expect((await network(page)).filter(r => admin.includes(r.path))).toEqual([]);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await expectNoA11yViolations(page, 'PERF product lazy');
});
test('PERF Orders autenticado carrega só chunk cliente, uma página e título/foco', async ({ page }) => {
  await login(page); await page.goto('/'); await settle(page);
  const calls = []; page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1/orders/me') calls.push(new URL(r.url()).searchParams.get('page')); });
  await page.evaluate(() => { history.pushState({}, '', '/orders'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible(); await settle(page);
  expect(calls).toEqual(['1']); const resources = await network(page);
  expect(resources.some(r => r.path === asset('src/component/Order/Orders.jsx'))).toBe(true); expect(resources.filter(r => admin.includes(r.path))).toEqual([]);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await expectNoA11yViolations(page, 'PERF orders lazy');
});
test('PERF imagens de cards reservam altura antes de terminar download', async ({ page }) => {
  let release; const blocked = new Promise(resolve => release = resolve);
  await page.route('**/demo-products/*.png', async route => { await blocked; await route.continue(); });
  await page.goto('/products'); await expect(page.locator('.productCard').first()).toBeVisible();
  const image = page.locator('.productCard img').first();
  const before = await image.evaluate(e => e.parentElement.getBoundingClientRect().height);
  expect(before).toBeGreaterThanOrEqual(200); release(); await settle(page);
  expect(await image.evaluate(e => e.parentElement.getBoundingClientRect().height)).toBe(before);
});
test('PERF Strict Mode reexecuta efeito duas vezes e compartilha leituras pendentes', async ({ page }) => {
  const product = (await (await page.request.get('/api/v1/products')).json()).products[0];
  const calls = []; page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/v1/product')) calls.push(new URL(r.url()).pathname); });
  await page.goto('/__test/boundary/?strict-read&id=' + product._id);
  await expect(page.getByRole('status')).toHaveText('Pronto');
  expect(await page.evaluate(() => window.__strictEffects)).toBe(2);
  expect(calls.filter(p => p === '/api/v1/products')).toHaveLength(1);
  expect(calls.filter(p => p === '/api/v1/product/' + product._id)).toHaveLength(1);
});
test('PERF falha do chunk exibe recuperação F031 e preserva storage', async ({ page }) => {
  await page.goto('/'); await settle(page);
  await page.evaluate(() => { localStorage.setItem('perf-preserve', 'safe-fixture'); sessionStorage.setItem('perf-attempt', 'safe-fixture'); });
  await page.route('**' + asset('src/component/User/LoginSignUp.jsx'), route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw new Error("test-only chunk failure")' }));
  // The boundary intentionally catches this module failure; no uncaught error is accepted.
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar esta tela.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await expectNoA11yViolations(page, 'PERF chunk recovery');
  expect(await page.evaluate(() => [localStorage.getItem('perf-preserve'), sessionStorage.getItem('perf-attempt')])).toEqual(['safe-fixture', 'safe-fixture']);
});
