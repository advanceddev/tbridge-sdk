import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dts from 'unplugin-dts/vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(root, 'index.ts'),
      name: 'TBridge',
      formats: ['es'],
      fileName: 'tbridge',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'oxc',
    target: 'es2023',
    rolldownOptions: {
      output: {
        exports: 'named',
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: resolve(root, 'tsconfig.build.json'),
      insertTypesEntry: true,
      include: [
        'index.ts',
        'core/**/*.ts',
        'bridge/**/*.ts',
        'wallet/**/*.ts',
        'ui/**/*.ts',
        'utils/**/*.ts',
      ],
      exclude: ['**/*.test.ts', 'tests/**', 'vite.config.ts', 'vitest.config.ts'],
    }),
  ],
});
