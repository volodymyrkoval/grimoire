import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/integration/setup.ts'],
    include: ['tests/integration/**/*.spec.ts'],
  },
});
