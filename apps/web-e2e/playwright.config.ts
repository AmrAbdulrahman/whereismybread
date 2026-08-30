import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const workspaceRoot = path.join(__dirname, '..', '..');
const baseURL = process.env['BASE_URL'] || 'http://localhost:3000';

export default defineConfig({
  testDir: './src',
  outputDir: path.join(
    workspaceRoot,
    'dist/.playwright/apps/web-e2e/test-output',
  ),
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Invoke `next` directly rather than through `nx run web:dev`: the
    // pnpm -> nx -> next process chain swallows the SIGTERM Playwright sends on
    // teardown, orphaning a dev server on :3000 that later runs then reuse.
    command: 'SKIP_ENV_VALIDATION=1 pnpm exec next dev apps/web --port 3000',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    cwd: workspaceRoot,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
