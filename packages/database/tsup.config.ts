import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { migrate: 'src/migrate.ts', seed: 'src/seed.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@ils\//],
});
