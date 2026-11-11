import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRoutes, deploymentStatus } from '../src/seo/metadata.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function auditSeo(directory = root) {
  const html = fs.readFileSync(path.join(directory, 'build/index.html'), 'utf8');
  const robots = fs.readFileSync(path.join(directory, 'build/robots.txt'), 'utf8');
  const count = pattern => [...html.matchAll(pattern)].length;
  const checks = {
    language: /lang="pt-BR"/.test(html), title: count(/<title>/g) === 1,
    description: count(/name="description"/g) === 1, viewport: count(/name="viewport"/g) === 1,
    noStaticCanonical: !/rel="canonical"/.test(html), noStaticProduct: !/application\/ld\+json/.test(html),
    noStaticNoindex: !/noindex/.test(html), robotsAllowsNoindexCrawl: /User-agent: \*/.test(robots) && !/Disallow:\s*\//.test(robots),
    noInventedSitemap: !fs.existsSync(path.join(directory, 'build/sitemap.xml')) && !/Sitemap:/i.test(robots),
    privateRegistry: ['/account', '/dashboard', '/shipping', '/cart'].every(p => privateRoutes[p]),
  };
  return { mode: 'READ_ONLY_OFFLINE', checks, passed: Object.values(checks).every(Boolean),
    initialHtml: { title: html.match(/<title>(.*?)<\/title>/s)?.[1], description: 'generic', canonical: 'ABSENT', og: 'ABSENT', routeSpecificMetadata: false },
    publicCanonicalOriginFormal: 'NOT_ESTABLISHED_BY_REPOSITORY', runtimeConfig: 'VITE_PUBLIC_SITE_URL (optional; value not printed)',
    sitemap: deploymentStatus.sitemap, production: deploymentStatus.production };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditSeo(); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1;
}
