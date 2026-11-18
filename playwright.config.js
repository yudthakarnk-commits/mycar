const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [ ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }] ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'chromium-small', use: { browserName: 'chromium', viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
