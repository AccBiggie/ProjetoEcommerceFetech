const { expect } = require('@playwright/test');
const AxeBuilder = require('../../frontend/node_modules/@axe-core/playwright').default;
async function expectNoA11yViolations(page, label) {
  // Audit the opened state, after finite CSS transitions (MUI Grow/Fade).
  // Infinite loading/focus animations stay present and are still audited.
  await page.waitForFunction(() => !document.getAnimations().some(animation =>
    animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)));
  const result = await new AxeBuilder({ page }).analyze();
  // Do not print HTML, values, screenshots or fixture data in axe diagnostics.
  const findings = result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help,
    selectors: nodes.map(node => node.target.map(selector => selector.replace(/\[([^\]]+)=.*?\]/g, '[$1]'))) }));
  expect(findings, label).toEqual([]);
  return result;
}
async function settle(page) {
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
}
async function semantics(page) {
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page).toHaveTitle(/Fetech/);
  expect(await page.getByRole('heading').evaluateAll(nodes => {
    const levels = nodes.filter(node => node.offsetParent !== null).map(node => Number(node.tagName.substring(1)));
    return levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1);
  })).toBe(true);
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[aria-hidden="true"]')))).toBe(false);
  expect(await page.locator('[tabindex]').evaluateAll(nodes => nodes.some(node => Number(node.tabIndex) > 0))).toBe(false);
  expect(await page.locator('[id]').evaluateAll(nodes => { const ids = nodes.map(node => node.id); return ids.length === new Set(ids).size; })).toBe(true);
}
async function login(page, role = 'user') {
  const { password } = require('../fixtures');
  await page.context().clearCookies();
  const response = await page.request.post('/api/v1/login', { data: { email: role + '@routes.example.com', password }, headers: { 'X-Fetech-CSRF': '1' } });
  expect(response.status()).toBe(200);
}
module.exports = { expectNoA11yViolations, settle, semantics, login };
