import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the production build (`vite build` + `vite preview`), not the
 * dev server -- matters here specifically because the service-worker/
 * offline test needs the real generated precache manifest, which only
 * exists in a built `dist/`. Every other test would work against `vite dev`
 * too, but keeping one server for the whole suite is simpler than running
 * two, and a production build is the more honest thing to test against
 * anyway (it's what actually ships).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // each test drives one shared IndexedDB-backed app instance; see e2e/README.md
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
