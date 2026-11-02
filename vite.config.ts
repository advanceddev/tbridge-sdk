import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { minifyCssLiteral } from './build/vite-plugin-minify-css-literal';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __TBRIDGE_VERSION__: JSON.stringify(pkg.version),
  },
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
  plugins: [minifyCssLiteral()],
});
