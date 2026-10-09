const { defineConfig } = require('@playwright/test');
const { origin } = require('./tests/helpers/e2eContext').context();
module.exports = defineConfig({
    testDir: './tests/e2e', testMatch: '*.spec.js', workers: 1, fullyParallel: false,
    timeout: 60000, expect: { timeout: 10000 }, forbidOnly: true, retries: 0,
    reporter: [['list'], ['./scripts/ci/e2eReporter.js'], ['html', { open: 'never', outputFolder: 'playwright-report/' + process.env.FETECH_TEST_RUN_ID }]],
    outputDir: 'test-results/' + process.env.FETECH_TEST_RUN_ID, globalTeardown: require.resolve('./tests/e2e/teardown'),
    use: { baseURL: origin, channel: process.env.E2E_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium'), headless: true, actionTimeout: 15000, navigationTimeout: 15000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'node tests/e2e/server.js', url: origin + '/api/v1/products', reuseExistingServer: false, timeout: 60000 },
});
