import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// A `base` de produção (/admin/) vem da CLI no build composto (`scripts/build-portal.mjs`),
// igual aos outros apps: em dev cada um roda na raiz.
export default defineConfig({
  server: { host: '::', port: 8081 },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(here, './src') },
  },
});
