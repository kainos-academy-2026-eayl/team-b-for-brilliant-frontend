import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    use: { baseURL: 'http://localhost:8000' },
    webServer: {
        command: 'npm run dev',
        env: { PORT: '8000' },
        url: 'http://localhost:8000/health',
        reuseExistingServer: true,
    },
});
