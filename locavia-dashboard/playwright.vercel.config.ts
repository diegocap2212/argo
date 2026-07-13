import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'https://locavia-dashboard.vercel.app',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    // Give more time for network requests on the deployed app
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Sem webServer — usamos a URL deployada diretamente
});
