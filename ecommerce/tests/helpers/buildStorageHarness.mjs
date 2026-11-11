import { build } from '../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
import e2eContext from './e2eContext.js';
export const output = path.join(e2eContext.context().directory, 'boundary-build');
export async function buildStorageHarness() {
    await build({ configFile: false, root: path.join(here, 'storageHarness'), base: '/__test/boundary/', plugins: [react()], logLevel: 'error',
        // Test-only development React exercises Strict Mode effect replay.
        define: { 'process.env.NODE_ENV': JSON.stringify('development') },
        resolve: { alias: { 'react-router': path.resolve(here, '../../frontend/node_modules/react-router'), react: path.resolve(here, '../../frontend/node_modules/react'), 'react-dom': path.resolve(here, '../../frontend/node_modules/react-dom'), 'react-redux': path.resolve(here, '../../frontend/node_modules/react-redux') } },
        build: { outDir: output, emptyOutDir: true } });
}
