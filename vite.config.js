import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  // MapLibre's worker is bundled explicitly in src/map.js; don't pre-bundle the library.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
