const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = import('../frontend/src/seo/metadata.mjs');
const product = { _id: '123456789012345678901234', name: 'Placa vídeo 🎮', description: '<p>Hardware\u0000 para seu setup 🎮</p>', priceCents: 319960, Stock: 2, ratings: 4.5, numOfReviews: 2, images: [{ url: '/produto.png' }] };
const origin = 'https://catalog.example.com';
test('SEO Home e catálogo; search/filtros/paginação preservam semântica sem indexação arbitrária', async () => {
  const { metadata } = await load;
  assert.equal(metadata().robots, 'index,follow');
  assert.equal(metadata({ pathname: '/products' }).robots, 'index,follow');
  for (const [pathname, search] of [['/search', ''], ['/products/abc', ''], ['/products', '?keyword=abc'], ['/products', '?category=abc'], ['/products', '?page=2']]) {
    const data = metadata({ pathname, search, origin }); assert.equal(data.robots, 'noindex,follow'); assert.equal(data.canonical, undefined);
  }
});
test('SEO rotas privadas, token, pedido e 404 não expõem dados arbitrários', async () => {
  const { metadata, privateRoutes } = await load;
  for (const pathname of [...Object.keys(privateRoutes), '/password/reset/SECRET_SENTINEL', '/order/PRIVATE_SENTINEL', '/unknown']) {
    const data = metadata({ pathname, search: '?email=PRIVATE_SENTINEL', title: 'PRIVATE_SENTINEL', product, origin });
    assert.equal(data.robots, 'noindex,follow'); assert.equal(data.canonical, undefined); assert.equal(data.jsonLd, undefined); assert.equal(data.social, undefined);
    assert.doesNotMatch(JSON.stringify(data), /SENTINEL/);
  }
});
test('SEO produto real, centavos exatos, estoque e agregados válidos sem campos inventados', async () => {
  const { metadata } = await load;
  const data = metadata({ pathname: '/product/' + product._id, product, origin });
  assert.equal(data.title, product.name + ' | Fetech'); assert.equal(data.description, 'Hardware para seu setup 🎮');
  assert.equal(data.jsonLd.offers.price, '3199.60'); assert.equal(data.jsonLd.offers.priceCurrency, 'BRL');
  assert.equal(data.jsonLd.offers.availability, 'https://schema.org/InStock');
  assert.equal(data.jsonLd.aggregateRating.reviewCount, 2); assert.equal(data.image, origin + '/produto.png');
  for (const field of ['brand', 'sku', 'gtin', 'mpn', 'review', 'seller', 'shippingDetails', 'hasMerchantReturnPolicy']) assert.equal(data.jsonLd[field], undefined);
  const zero = metadata({ pathname: '/product/' + product._id, product: { ...product, Stock: 0, priceCents: 1, numOfReviews: 0 } });
  assert.equal(zero.jsonLd.offers.price, '0.01'); assert.equal(zero.jsonLd.offers.availability, 'https://schema.org/OutOfStock'); assert.equal(zero.jsonLd.aggregateRating, undefined);
  for (const changes of [{ ratings: 6 }, { numOfReviews: -1 }, { ratings: NaN }]) assert.equal(metadata({ pathname: '/product/' + product._id, product: { ...product, ...changes } }).jsonLd.aggregateRating, undefined);
  assert.equal(metadata({ pathname: '/product/' + product._id, product: { ...product, priceCents: 1.1 } }).jsonLd.offers, undefined);
});
test('SEO produto loading/removido ou ID diferente não publica schema antigo', async () => {
  const { metadata } = await load;
  for (const value of [undefined, { ...product, _id: 'different' }]) {
    const data = metadata({ pathname: '/product/' + product._id, product: value });
    assert.equal(data.robots, 'noindex,follow'); assert.equal(data.jsonLd, undefined);
  }
});
test('SEO canonical somente origem validada, sem query/hash/browser e imagem segura', async () => {
  const { metadata, publicOrigin, imageUrl } = await load;
  for (const value of [undefined, 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?host=evil', 'http://example.com', 'https://127.0.0.1', 'https://example.com/#hash']) assert.equal(publicOrigin(value), null);
  const data = metadata({ pathname: '/product/' + product._id, product, search: '?utm_source=evil&origin=https://evil.example#x', origin });
  assert.equal(data.canonical, origin + '/product/' + product._id);
  assert.equal(metadata({ pathname: '/', origin: 'https://example.com/path' }).canonical, undefined);
  assert.equal(imageUrl('/relative.png', null), null); assert.equal(imageUrl('//evil.example/image', origin), null);
  assert.equal(imageUrl('https://media.example.com/real.png', null), 'https://media.example.com/real.png');
  assert.equal(imageUrl('data:image/png;base64,secret', origin), null);
});
test('SEO serialização evita breakout; texto limita por code point Unicode', async () => {
  const { serializeJsonLd, cleanText } = await load;
  const dangerous = { name: '</script><script>alert(1)</script> & \u2028\u2029' };
  const json = serializeJsonLd(dangerous); assert.doesNotMatch(json, /[<>&\u2028\u2029]/u); assert.deepEqual(JSON.parse(json), dangerous);
  assert.equal(cleanText('<b>🎮🎮🎮</b>', 2), '🎮🎮');
});
test('SEO sitemap explicitamente bloqueado sem simular publicação', async () => {
  const { deploymentStatus } = await load; assert.equal(deploymentStatus.sitemap, 'BLOCKED_BY_DEPLOYMENT'); assert.equal(deploymentStatus.production, 'BLOCKED_BY_F023');
});
