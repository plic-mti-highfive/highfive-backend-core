import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Tests d'integration : l'application Nest reelle, une vraie base PostgreSQL
 * et un vrai Redis, tous deux jetables (voir `test/integration/global-setup.ts`).
 *
 * esbuild (utilise par vitest) n'emet pas `emitDecoratorMetadata`, dont
 * l'injection de dependances de Nest a besoin : on compile donc avec SWC.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/integration/**/*.int-spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    // Demarrer l'application complete (argon2, TypeORM, Nest) est long.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
});
