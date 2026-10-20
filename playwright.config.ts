import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    { command: 'tsx e2e/stubAccountService.ts', port: 4100 },
    {
      command: 'tsx src/index.ts',
      port: 3100,
      env: {
        PORT: '3100',
        SESSION_SECRET: 'e2e',
        CUSTOMER_ACCOUNT_SERVICE_URL: 'http://localhost:4100',
      },
    },
  ],
})
