const { test, expect } = require('@playwright/test');
const { password } = require('../fixtures');
const { image } = require('../helpers/mediaHarness');
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);
async function login(page) {
    await page.goto('/login'); await page.locator('.loginForm input[type=email]').fill('media@routes.example.com'); await page.locator('.loginForm input[type=password]').fill(password); await page.locator('.loginForm button[type=submit]').click(); await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/me/update');
}
test('avatar: FormData, preview revogado, persistência, spoof e tamanho', async ({ page }) => {
    const png = await image(); await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.addInitScript(() => { const original = URL.revokeObjectURL; window.__revokedAvatarUrls = []; URL.revokeObjectURL = url => { window.__revokedAvatarUrls.push(url); original(url); }; });
    await login(page); const input = page.locator('input[type=file][name=avatar]');
    await input.setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('Foto do perfil')).toHaveAttribute('src', /^blob:/);
    const reply = page.waitForResponse(r => r.url().endsWith('/api/v1/me/avatar'));
    await page.getByRole('button', { name: 'Salvar foto', exact: true }).click(); const response = await reply; expect(response.status()).toBe(200); const user = (await response.json()).user;
    await expect(page.getByAltText('Foto do perfil')).toHaveAttribute('src', user.avatar.url); expect(await page.evaluate(() => window.__revokedAvatarUrls.length)).toBeGreaterThan(0);
    await page.reload(); await expect(page.getByAltText('Foto do perfil')).toHaveAttribute('src', user.avatar.url);
    await input.setInputFiles({ name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('PRIVATE_FILE_SENTINEL') });
    const failed = page.waitForResponse(r => r.url().endsWith('/api/v1/me/avatar')); await page.getByRole('button', { name: 'Salvar foto', exact: true }).click(); expect((await failed).status()).toBe(415);
    await expect(page.getByRole('alert')).toContainText('JPEG, PNG ou WebP'); await expect(page.getByAltText('Foto do perfil')).toHaveAttribute('src', user.avatar.url);
    await input.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }); await expect(page.getByRole('alert')).toContainText('5 MiB'); await expect(page.getByRole('button', { name: 'Salvar foto', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cliente Media Atualizado'); await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await expect(page).toHaveURL(/\/account/);
    expect((await (await page.request.get('/api/v1/me')).json()).user.avatar.public_id).toBe(user.avatar.public_id);
    const remote = await mutation(page, 'put', '/api/v1/me/update', { data: { avatar: 'https://example.test/file.txt' } }); expect(remote.status()).toBe(400);
});
