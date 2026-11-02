import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __TBRIDGE_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
  },
});
