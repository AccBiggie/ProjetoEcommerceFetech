import { build } from '../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const output = path.resolve(here, '../../../.local/fet-front-001-boundary');
export async function buildStorageHarness() {
    await build({ configFile: false, root: path.join(here, 'storageHarness'), base: '/__test/boundary/', plugins: [react()], logLevel: 'error',
        resolve: { alias: { react: path.resolve(here, '../../frontend/node_modules/react'), 'react-dom': path.resolve(here, '../../frontend/node_modules/react-dom'), 'react-redux': path.resolve(here, '../../frontend/node_modules/react-redux') } },
        build: { outDir: output, emptyOutDir: true } });
}
