const { test, expect } = require('@playwright/test');
const { settle, login, expectNoA11yViolations } = require('../helpers/accessibility');
const { installSecurityChecks } = require('./securityChecks');
installSecurityChecks(test, expect);
const navigate = (page, url) => page.evaluate(url => { history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, url);
async function uniqueHead(page) {
  for (const selector of ['head title', 'head meta[name="description"]', 'head meta[name="robots"]']) await expect(page.locator(selector)).toHaveCount(1);
  expect(await page.locator('head meta[property^="og:"],head meta[name^="twitter:"],head link[rel="canonical"]').evaluateAll(nodes => {
    const keys = nodes.map(n => n.getAttribute('property') || n.name || n.rel); return new Set(keys).size === keys.length;
  })).toBe(true);
  expect(await page.locator('script[type="application/ld+json"]').count()).toBeLessThanOrEqual(1);
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test('SEO HTML inicial sem JS mostra apenas metadata genérica', async ({ request }) => {
  const response = await request.get('/product/123456789012345678901234'); const html = await response.text();
  expect(response.status()).toBe(200); // Test-only SPA fallback; no claim about production HTTP 404.
  expect(html).toContain('Loja Fetech'); expect(html).toContain('Loja Fetech de hardware e tecnologia');
  expect(html).not.toMatch(/application\/ld\+json|rel="canonical"|property="og:/);
});
test('SEO Home, produtos A/B, Home, Admin e produto eliminam tags antigas', async ({ page }) => {
  const { products } = await (await page.request.get('/api/v1/products')).json(); const [a, b] = products;
  await login(page, 'admin'); await page.goto('/'); await settle(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  // No canonical base is inferred from the test host. Configured origins are covered by pure fixture tests.
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  for (const p of [a, b]) {
    await navigate(page, '/product/' + p._id); await expect(page).toHaveTitle(p.name + ' | Fetech'); await settle(page);
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(data.name).toBe(p.name); expect(data.offers.priceCurrency).toBe('BRL');
    expect(data.offers.price).toBe((p.priceCents / 100).toFixed(2));
    expect(data.offers.availability).toBe('https://schema.org/' + (p.Stock ? 'InStock' : 'OutOfStock'));
    expect(data.aggregateRating).toBeUndefined(); expect(data.brand).toBeUndefined(); await uniqueHead(page);
  }
  await expectNoA11yViolations(page, 'SEO produto');
  await navigate(page, '/'); await expect(page).toHaveTitle(/Loja Fetech/); await expect(page.locator('script[data-fetech-seo]')).toHaveCount(0);
  await navigate(page, '/dashboard'); await expect(page).toHaveTitle('Painel administrativo | Fetech'); await settle(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0); await uniqueHead(page);
  await navigate(page, '/product/' + a._id); await expect(page).toHaveTitle(a.name + ' | Fetech'); await uniqueHead(page);
});
test('SEO conta, checkout e reset não deixam PII/tokens no head', async ({ page }) => {
  await login(page); await page.goto('/account'); await settle(page);
  for (const url of ['/account', '/account/privacy', '/addresses', '/cart', '/shipping', '/password/reset/SECRET_SEO_SENTINEL']) {
    await navigate(page, url); await settle(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('link[rel="canonical"],meta[property^="og:"],script[data-fetech-seo]')).toHaveCount(0);
    expect(await page.locator('head').textContent()).not.toMatch(/SECRET_SEO_SENTINEL|routes\.example\.com|Teste user/); await uniqueHead(page);
  }
});
test('SEO busca/filtros, 404 e produto removido são noindex', async ({ page }) => {
  for (const url of ['/products?keyword=SECRET_QUERY', '/products?page=2', '/products?category=Hardware', '/search', '/missing-seo', '/product/123456789012345678901234']) {
    await page.goto(url); await settle(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('script[data-fetech-seo]')).toHaveCount(0); await uniqueHead(page);
    expect(await page.locator('head').textContent()).not.toContain('SECRET_QUERY');
  }
  await expectNoA11yViolations(page, 'SEO produto indisponível');
});
test('SEO Strict Mode replay mantém uma tag por chave', async ({ page }) => {
  await page.goto('/__test/boundary/?strict-seo=1'); await expect(page.getByRole('heading', { name: 'SEO Strict Mode' })).toBeVisible();
  expect(await page.evaluate(() => window.__strictSeoEffects)).toBe(2); await uniqueHead(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});
test('SEO lazy fallback e Product → Login não mantêm schema/canonical', async ({ page }) => {
  const fs = require('node:fs'); const path = require('node:path');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../frontend/build/.vite/manifest.json'), 'utf8'));
  const chunk = manifest['src/component/Product/ProductDetails.jsx'].file;
  const { products } = await (await page.request.get('/api/v1/products')).json();
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('**/' + chunk, async route => { await held; await route.continue(); });
  // Initial lazy route shows fallback; React transitions may retain the previous page during SPA navigation.
  await page.goto('/product/' + products[0]._id, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1[data-loading-heading]')).toBeVisible();
  await expect(page.locator('script[data-fetech-seo]')).toHaveCount(0); await uniqueHead(page);
  release(); await expect(page).toHaveTitle(products[0].name + ' | Fetech');
  await navigate(page, '/login'); await expect(page).toHaveTitle('Bem-vindo de volta | Fetech');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('script[data-fetech-seo],link[rel="canonical"],meta[property^="og:"]')).toHaveCount(0);
  await uniqueHead(page); await expectNoA11yViolations(page, 'SEO login após produto');
});
