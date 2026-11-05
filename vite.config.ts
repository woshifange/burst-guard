import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1800,
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: false },
  preview: { host: '0.0.0.0', port: 4173, strictPort: false },
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
  },
});
