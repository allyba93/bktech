import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,   // sequential — tests share Firebase state
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Auth state is stored and reused across tests
    storageState: 'tests/.auth/state.json',
  },

  projects: [
    // Step 1: login once and save session
    {
      name: 'setup',
      testMatch: '**/setup/auth.setup.ts',
      use: { storageState: undefined },
    },
    // Step 2: all functional tests reuse saved session
    {
      name: 'functional',
      dependencies: ['setup'],
      testMatch: '**/specs/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
