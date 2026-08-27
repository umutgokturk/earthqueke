import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

/**
 * E2E smoke suite. Expects the stack running in memory mode:
 *   npm run dev   (or: api on :4000 with embedded ingestion + web on :3000)
 * `reuseExistingServer` lets it attach to an already-running dev stack.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1366, height: 850 },
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: [
    {
      command: 'npx tsx apps/api/src/main.ts',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { NODE_ENV: 'development', LOG_LEVEL: 'warn' },
    },
    {
      command: 'npm run dev -w @ils/web',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
