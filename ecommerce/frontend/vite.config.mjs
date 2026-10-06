import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1', port: 3000, strictPort: true,
      proxy: { '/api': { target: process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:4000', changeOrigin: true } },
    },
    build: { outDir: 'build' },
  };
});
