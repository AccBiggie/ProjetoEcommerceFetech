const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/e2e', testMatch: '*.spec.js', workers: 1, fullyParallel: false,
    timeout: 60000, expect: { timeout: 10000 }, reporter: 'list',
    outputDir: 'test-results', globalTeardown: require.resolve('./tests/e2e/teardown'),
    use: { baseURL: 'http://127.0.0.1:3300', channel: process.env.E2E_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium'), headless: true, actionTimeout: 15000, navigationTimeout: 15000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'node tests/e2e/server.js', url: 'http://127.0.0.1:3300/api/v1/products', reuseExistingServer: false, timeout: 60000 },
});
