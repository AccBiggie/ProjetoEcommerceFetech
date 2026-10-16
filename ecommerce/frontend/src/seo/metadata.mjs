// Public catalog data only. Never accept account/order objects or browser origins.
export const defaultTitle = 'Loja Fetech | Entre já para o mundo gamer';
export const defaultDescription = 'Loja Fetech de hardware e tecnologia';
export const deploymentStatus = Object.freeze({ sitemap: 'BLOCKED_BY_DEPLOYMENT', production: 'BLOCKED_BY_F023' });
export const privateRoutes = Object.freeze({
  '/account': 'Meu perfil', '/account/privacy': 'Privacidade', '/addresses': 'Meus endereços',
  '/me/update': 'Editar perfil', '/password/update': 'Alterar senha', '/shipping': 'Finalizar pedido',
  '/orders': 'Meus pedidos', '/dashboard': 'Painel administrativo', '/cart': 'Carrinho',
  '/login': 'Bem-vindo de volta', '/password/forgot': 'Recuperar senha',
});
export function cleanText(value, length = 160) {
  const plain = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim();
  return Array.from(plain).slice(0, length).join('');
}
export function publicOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port ||
        !url.hostname.includes('.') || /^(localhost|127\.|0\.|\[)/i.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
export function imageUrl(value, origin) {
  if (typeof value !== 'string' || !value) return null;
  try {
    if (!value.startsWith('https://') && !(origin && value.startsWith('/') && !value.startsWith('//'))) return null;
    const url = new URL(value, origin || undefined);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function metadata({ pathname = '/', search = '', title, product, origin: configuredOrigin } = {}) {
  const origin = publicOrigin(configuredOrigin);
  const result = { title: 'Página não encontrada | Fetech', description: defaultDescription, robots: 'noindex,follow' };
  let path;
  if (privateRoutes[pathname]) result.title = privateRoutes[pathname] + ' | Fetech';
  else if (/^\/password\/reset\/[^/]+$/.test(pathname)) result.title = 'Redefinir senha | Fetech';
  else if (/^\/order\/[^/]+$/.test(pathname)) result.title = 'Detalhes do pedido | Fetech';
  else if (pathname === '/') {
    Object.assign(result, { title: defaultTitle, description: 'Hardware e tecnologia para montar seu próximo setup. Conheça os produtos da Loja Fetech.', robots: 'index,follow' });
    path = '/';
  } else if (pathname === '/search' || /^\/products(?:\/[^/]+)?$/.test(pathname)) {
    const params = new URLSearchParams(search);
    const searching = pathname !== '/products' || Boolean(params.get('keyword'));
    result.title = (searching ? 'Pesquisar produtos' : 'Todos os produtos') + ' | Fetech';
    result.description = 'Explore o catálogo de hardware e tecnologia da Loja Fetech.';
    // Category/page are meaningful catalog variants; without an indexing policy, remain noindex.
    if (!searching && !params.get('category') && !params.get('page')) { result.robots = 'index,follow'; path = '/products'; }
  } else {
    const match = pathname.match(/^\/product\/([a-f\d]{24})$/i);
    if (match) {
      result.title = 'Produto indisponível | Fetech';
      if (product?._id === match[1] && cleanText(product.name)) {
        result.title = cleanText(product.name, 120) + ' | Fetech';
        result.description = cleanText(product.description) || 'Conheça este produto no catálogo da Loja Fetech.';
        result.robots = 'index,follow'; path = '/product/' + match[1];
        const image = imageUrl(product.images?.[0]?.url, origin);
        const schema = { '@context': 'https://schema.org', '@type': 'Product', name: cleanText(product.name, 120), description: result.description };
        if (image) { schema.image = [image]; result.image = image; }
        if (origin) schema.url = origin + path;
        if (Number.isSafeInteger(product.priceCents) && product.priceCents >= 0 && Number.isSafeInteger(product.Stock) && product.Stock >= 0) {
          const cents = BigInt(product.priceCents);
          schema.offers = { '@type': 'Offer', price: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, priceCurrency: 'BRL', availability: 'https://schema.org/' + (product.Stock > 0 ? 'InStock' : 'OutOfStock') };
          if (origin) schema.offers.url = origin + path;
        }
        if (Number.isSafeInteger(product.numOfReviews) && product.numOfReviews > 0 && Number.isFinite(product.ratings) && product.ratings >= 1 && product.ratings <= 5)
          schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: product.ratings, reviewCount: product.numOfReviews, bestRating: 5, worstRating: 1 };
        result.jsonLd = schema;
      }
    }
  }
  // Page titles are used only on known public pages; private titles never depend on user data.
  if (path === '/products' && title) result.title = 'Todos os produtos | Fetech';
  if (path && origin) result.canonical = origin + path;
  if (path) result.social = { title: result.title, description: result.description, type: result.jsonLd ? 'product' : 'website' };
  return result;
}
