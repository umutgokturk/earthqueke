import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { migrate: 'src/migrate-cli.ts', seed: 'src/seed-cli.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@ils\//],
  banner: {
    // CJS deps (pg, ioredis) are bundled into this ESM file; give them a require()
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
