import { defineConfig } from '@playwright/test'

const BACKEND = 'python -m uvicorn app.main:app --port 8000'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
  },
  // The specs share one live backend (history DB). Some checks write to it
  // (save this check, batch upload), so spec files must not run in parallel.
  workers: 1,
  webServer: [
    {
      command: BACKEND,
      url: 'http://localhost:8000/api/health',
      cwd: '../backend',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
