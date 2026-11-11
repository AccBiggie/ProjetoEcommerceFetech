import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { bundleProvenance } from './scripts/bundle-provenance.mjs';
import { publicOrigin } from './src/seo/metadata.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const site = process.env.VITE_PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL;
  if (site && !publicOrigin(site)) throw new Error('VITE_PUBLIC_SITE_URL deve ser uma origem HTTPS sem caminho, query, porta ou credenciais.');
  return {
    plugins: [react(), bundleProvenance(process.cwd())],
    server: {
      host: '127.0.0.1', port: 3000, strictPort: true,
      proxy: { '/api': { target: process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:4000', changeOrigin: true } },
    },
    build: { outDir: 'build', manifest: true },
  };
});
