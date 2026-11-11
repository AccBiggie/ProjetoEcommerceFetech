import { defaultDescription, defaultTitle, serializeJsonLd } from './metadata.mjs';
const selectors = 'title,meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],script[data-fetech-seo]';
// Sole DOM head writer, shared by React and bootstrap recovery. Rebuild removes stale tags/duplicates.
export function applyHead(data, document = globalThis.document) {
  document.head.querySelectorAll(selectors).forEach(node => node.remove());
  const add = (tag, attributes, text) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    document.head.append(node);
  };
  add('title', {}, data.title);
  add('meta', { name: 'description', content: data.description });
  add('meta', { name: 'robots', content: data.robots });
  if (data.canonical) add('link', { rel: 'canonical', href: data.canonical });
  if (data.social) {
    for (const [key, value] of Object.entries(data.social)) add('meta', { property: 'og:' + key, content: value });
    if (data.canonical) add('meta', { property: 'og:url', content: data.canonical });
    if (data.image) add('meta', { property: 'og:image', content: data.image });
    add('meta', { name: 'twitter:card', content: data.image ? 'summary_large_image' : 'summary' });
    for (const key of ['title', 'description']) add('meta', { name: 'twitter:' + key, content: data.social[key] });
    if (data.image) add('meta', { name: 'twitter:image', content: data.image });
  }
  if (data.jsonLd) add('script', { type: 'application/ld+json', 'data-fetech-seo': '' }, serializeJsonLd(data.jsonLd));
}
export function clearHead(document = globalThis.document) {
  applyHead({ title: defaultTitle, description: defaultDescription, robots: 'noindex,follow' }, document);
}
export function recoveryHead(document = globalThis.document) {
  applyHead({ title: 'Falha ao carregar | Fetech', description: defaultDescription, robots: 'noindex,follow' }, document);
}
