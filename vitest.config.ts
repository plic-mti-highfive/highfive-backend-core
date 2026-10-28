import { defineConfig } from 'vitest/config';

/**
 * Tests unitaires : rapides, sans base ni docker. Les tests d'integration
 * (`test/integration/`) ont leur propre configuration :
 * `vitest.integration.config.ts` (`pnpm test:int`).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
});
