const { test, expect } = require('@playwright/test');
const { expectNoA11yViolations: axe, settle, semantics, login } = require('../helpers/accessibility');
const { password } = require('../fixtures');
const { installSecurityChecks } = require('./securityChecks');
installSecurityChecks(test, expect);

for (const mode of ['light', 'dark']) {
  test(`F033 axe público e semântica: ${mode}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(value => localStorage.setItem('fetech-color-mode', value), mode);
    for (const route of ['/', '/products', '/search', '/cart', '/login', '/password/forgot', '/password/reset/invalid', '/missing']) {
      await test.step(route, async () => { await page.goto(route); await settle(page); await semantics(page); await axe(page, route + ' ' + mode); });
    }
    await page.goto('/login'); await page.getByRole('tab', { name: 'Criar conta' }).click();
    await semantics(page); await axe(page, 'register ' + mode);
    await expect(page.getByRole('textbox', { name: /^Nome/ })).toHaveAttribute('autocomplete', 'name');
    await expect(page.getByRole('textbox', { name: /^E-mail/ })).toHaveAttribute('required', '');
    await page.goto('/products?keyword=sem-resultados-f033'); await settle(page);
    await expect(page.getByRole('status')).toContainText('0 produtos'); await axe(page, 'empty search');
    await page.goto('/');
    await page.getByRole('button', { name: 'Compre por departamento' }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible(); await axe(page, 'department menu');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Compre por departamento' })).toBeFocused();
  });
  test(`F033 axe cliente, checkout e endereço: ${mode}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(value => localStorage.setItem('fetech-color-mode', value), mode);
    await login(page);
    for (const route of ['/account', '/addresses', '/me/update', '/password/update', '/orders', '/account/privacy']) {
      await test.step(route, async () => { await page.goto(route); await settle(page); await semantics(page); await axe(page, route + ' ' + mode); });
    }
    await page.goto('/addresses');
    const trigger = page.getByRole('button', { name: 'Adicionar endereço', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await axe(page, 'address drawer');
    await expect(dialog.getByRole('textbox', { name: /^Identificação/ })).toBeFocused();
    for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    const products = await (await page.request.get('/api/v1/products')).json();
    await page.goto('/product/' + products.products[0]._id); await settle(page); await semantics(page); await axe(page, 'product');
    await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Produto adicionado' })).toBeVisible();
    await page.goto('/cart'); await settle(page); await axe(page, 'populated cart');
    const increase = page.getByRole('button', { name: /^Aumentar quantidade de / });
    await increase.focus(); await page.keyboard.press('Space');
    await expect(page.getByRole('spinbutton', { name: /^Quantidade de / })).toHaveValue('2');
    await page.goto('/shipping'); await settle(page); await axe(page, 'checkout');
    await page.getByRole('button', { name: 'Criar pedido', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: /^Nome do destinatário/ })).toBeFocused();
    await expect(page.locator('main [aria-invalid="true"]').first()).toHaveAttribute('aria-describedby', /helper-text/);
    await expect(page.getByRole('alert').filter({ hasText: 'Confira os campos' })).toBeVisible();
    await axe(page, 'invalid checkout');
    await page.goto('/me/update');
    const photo = page.getByRole('button', { name: 'Escolher foto', exact: true });
    await photo.focus(); const chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Space');
    await (await chooser).setFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await expect(page.getByRole('alert').filter({ hasText: 'JPEG' })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveAttribute('aria-invalid', 'true'); await axe(page, 'avatar error');
  });
  test(`F033 axe seis abas administrativas e offcanvas: ${mode}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(value => localStorage.setItem('fetech-color-mode', value), mode); await login(page, 'admin');
    await page.goto('/dashboard'); await settle(page);
    for (const name of ['Produtos', 'Categorias', 'Usuários', 'Pedidos', 'Auditoria', 'Privacidade']) {
      await page.getByRole('tab', { name, exact: true }).click(); await page.waitForLoadState('networkidle');
      await semantics(page); await expect(page.getByRole('tabpanel')).toBeVisible(); await axe(page, 'admin ' + name + ' ' + mode);
    }
    await page.getByRole('tab', { name: 'Categorias', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Usuários', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Usuários', exact: true })).toHaveAttribute('aria-selected', 'true');
    const trigger = page.getByRole('button', { name: 'Cadastrar categoria' }); await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('textbox', { name: /^Nome da categoria/ })).toBeFocused();
    await axe(page, 'category drawer');
    for (let i = 0; i < 8; i++) { await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.getByRole('tab', { name: 'Produtos', exact: true }).click();
    await page.getByRole('button', { name: /^Excluir / }).first().focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await axe(page, 'delete confirmation'); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Excluir / }).first()).toBeFocused();
  });
}

test('F033 primeiro Tab, skip link, títulos, navegação SPA e filtros preservam foco', async ({ page }) => {
  await page.goto('/login'); await settle(page); await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('main')).toBeFocused();
  const link = page.getByRole('link', { name: 'Esqueci minha senha' }); await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await expect(page).toHaveTitle('Recuperar senha | Fetech');
  await page.goBack(); await expect(page.locator('main')).toBeFocused();
  await page.goto('/products'); const category = page.getByRole('combobox', { name: 'Categoria', exact: true });
  await category.focus(); await category.selectOption({ index: 1 }); await expect(category).toBeFocused();
  await page.goto('/products'); await page.locator('.paginationBox button').filter({ hasText: '2' }).click();
  await expect(page.locator('.paginationBox [aria-current=page]')).toHaveText('2'); await axe(page, 'pagination');
});

test('F033 login por teclado, visibilidade da senha, erro inline e cadastro', async ({ page }) => {
  await page.goto('/login');
  await page.locator('.loginForm button[type=submit]').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: /^E-mail/ })).toBeFocused();
  await expect(page.getByRole('textbox', { name: /^E-mail/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('textbox', { name: /^E-mail/ })).toHaveAttribute('aria-describedby', /helper-text/);
  await axe(page, 'native login invalid');
  const email = page.getByRole('textbox', { name: /^E-mail/ }); await email.focus();
  await page.keyboard.type('user@routes.example.com'); await page.keyboard.press('Tab'); await page.keyboard.type(password);
  await page.keyboard.press('Tab'); await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Ocultar senha' })).toBeFocused();
  const indicator = await page.getByRole('button', { name: 'Ocultar senha' }).evaluate(node => ({
    width: parseFloat(getComputedStyle(node).outlineWidth), style: getComputedStyle(node).outlineStyle,
  }));
  expect(indicator.width).toBeGreaterThanOrEqual(3); expect(indicator.style).not.toBe('none');
  await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.locator('.loginForm button[type=submit]')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().clearCookies(); await page.goto('/login');
  await page.route('**/api/v1/login', route => route.fulfill({ status: 401, json: { success: false, message: 'Credenciais inválidas.' } }));
  await email.fill('user@routes.example.com'); await page.locator('input[type=password]').fill(password);
  await page.locator('.loginForm button[type=submit]').click(); await expect(page.locator('main [role=alert]')).toContainText('Credenciais inválidas.'); await axe(page, 'login error');
  await page.getByRole('tab', { name: 'Entrar', exact: true }).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
  await page.getByRole('textbox', { name: /^Nome/ }).focus(); await page.keyboard.type('Cliente Acessível');
  await page.keyboard.press('Tab'); await page.keyboard.type('accessibility@routes.example.com');
  await page.keyboard.press('Tab'); await page.keyboard.type(password);
  await axe(page, 'register filled');
});

test('F033 recuperação por teclado, resposta uniforme e required associado', async ({ page }) => {
  await page.goto('/password/forgot');
  const email = page.getByRole('textbox', { name: /^E-mail/ });
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).focus(); await page.keyboard.press('Enter');
  await expect(email).toBeFocused(); await expect(email).toHaveAttribute('aria-invalid', 'true');
  await email.fill('missing-a11y@example.invalid'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enviar link de recuperação' })).toBeFocused();
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/password/forgot') && r.request().method() === 'POST');
  await page.keyboard.press('Enter'); expect((await response).status()).toBe(200);
  await expect(page.locator('main [role=status]')).toBeVisible(); await axe(page, 'forgot generic success');
});

test('F033 mobile 320px, desktop equivalente a 200%, menus e movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 320, height: 720 }, { width: 640, height: 450 }]) {
    await page.setViewportSize(viewport);
    for (const route of ['/', '/products', '/login', '/missing']) {
      await page.goto(route); await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await axe(page, route + ' narrow');
    }
    await page.getByRole('button', { name: 'Compre por departamento' }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Compre por departamento' })).toBeFocused();
  }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('F033 Error Boundary: axe, foco e recarga por teclado', async ({ page }) => {
  for (const mode of ['', '?redux=1', '?bootstrap=1']) {
    await page.goto('/__test/boundary/index.html' + mode);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await axe(page, 'boundary ' + mode);
    if (mode.includes('bootstrap')) await expect(page.getByRole('button', { name: 'Recarregar página', exact: true })).toBeFocused();
    else { await expect(page.getByRole('heading', { level: 1 })).toBeFocused(); await page.keyboard.press('Tab'); }
    await expect(page.getByRole('button', { name: 'Recarregar página', exact: true })).toBeFocused();
    const navigation = page.waitForEvent('framenavigated'); await page.keyboard.press('Enter'); await navigation;
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('F033 loading, busca por teclado, card, remoção e menu da conta', async ({ page }) => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/products?*', async route => { await waiting; await route.continue(); });
  await page.goto('/'); await expect(page.getByRole('status', { name: 'Carregando produtos' })).toBeVisible();
  try { await axe(page, 'loading skeletons'); }
  finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
  await settle(page);
  await page.getByRole('textbox', { name: 'Pesquisar produtos', exact: true }).focus(); await page.keyboard.type('Hardware'); await page.keyboard.press('Enter');
  await expect(page.locator('main p[role=status]')).toContainText('produtos encontrados');
  await page.locator('.productCard').first().focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('link', { name: 'Carrinho', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Remover .* do carrinho$/ }).focus(); await page.keyboard.press('Space');
  await expect(page.getByText('Sem produtos no carrinho.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await login(page); await page.goto('/account');
  const trigger = page.getByRole('button', { name: 'Minha conta', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  await axe(page, 'account menu'); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
});

test('F033 checkout e admin em reflow; contraste de textos, botões, bordas e foco', async ({ page }) => {
  test.setTimeout(120000);
  function ratio(a, b) {
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  }
  await login(page);
  await page.goto('/products'); await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).first().click();
  for (const mode of ['light', 'dark']) {
    await page.goto('/shipping'); await settle(page);
    if (mode === 'dark') await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
    for (const viewport of [{ width: 320, height: 720 }, { width: 640, height: 450 }]) {
      await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Criar pedido', exact: true })).toBeVisible(); await axe(page, 'checkout reflow ' + mode);
    }
    const input = page.getByRole('textbox', { name: /^Nome do destinatário/ }); await input.focus();
    const pairs = await page.evaluate(() => {
      const card = document.querySelector('main form'), outline = card.querySelector('.MuiOutlinedInput-notchedOutline');
      const button = card.querySelector('button[type=submit]');
      return { border: getComputedStyle(outline).borderTopColor, background: getComputedStyle(card).backgroundColor,
        text: getComputedStyle(card.querySelector('h2')).color, buttonText: getComputedStyle(button).color, buttonBackground: getComputedStyle(button).backgroundColor };
    });
    expect(ratio(pairs.border, pairs.background)).toBeGreaterThanOrEqual(3);
    expect(ratio(pairs.text, pairs.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(pairs.buttonText, pairs.buttonBackground)).toBeGreaterThanOrEqual(4.5);
  }
  await login(page, 'admin'); await page.goto('/dashboard'); await settle(page);
  for (const name of ['Produtos', 'Categorias', 'Usuários', 'Pedidos', 'Auditoria', 'Privacidade']) {
    await page.getByRole('tab', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await axe(page, 'admin narrow ' + name);
  }
});

test('F033 probes reais de Tab em login, produto, cart, checkout, privacy e admin', async ({ page }, testInfo) => {
  const sequences = [];
  async function probe(label, route, steps = 10) {
    await page.goto(route); await settle(page);
    await page.locator('main').focus();
    const controls = [];
    for (let step = 0; step < steps; step++) {
      await page.keyboard.press('Tab');
      const control = await page.evaluate(() => {
        const node = document.activeElement;
        const labels = node.labels ? [...node.labels].map(label => label.textContent).join(' ') : '';
        // No input values, DOM HTML, email or address data are included.
        return { tag: node.tagName, name: (node.getAttribute('aria-label') || labels || node.textContent).trim().slice(0, 100),
          hidden: Boolean(node.closest('[aria-hidden="true"]')), positive: node.tabIndex > 0 };
      });
      expect(control.hidden).toBe(false); expect(control.positive).toBe(false); expect(control.tag).not.toBe('BODY'); expect(control.name.length).toBeGreaterThan(0);
      controls.push({ tag: control.tag, name: control.name });
    }
    sequences.push({ flow: label, controls });
  }
  await probe('login', '/login');
  const products = await (await page.request.get('/api/v1/products')).json();
  await probe('produto', '/product/' + products.products[0]._id);
  await page.getByRole('button', { name: 'Adicionar ao Carrinho', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Produto adicionado' })).toBeVisible();
  await probe('cart', '/cart'); await login(page);
  await probe('checkout', '/shipping'); await probe('privacy', '/account/privacy', 6);
  await login(page, 'admin'); await probe('admin', '/dashboard');
  await testInfo.attach('keyboard-sequences.json', { body: Buffer.from(JSON.stringify(sequences, null, 2)), contentType: 'application/json' });
});

test('F033 salvar/excluir categoria devolve foco ao cadastro após pending ou trigger removido', async ({ page }) => {
  await login(page, 'admin'); await page.goto('/dashboard'); await settle(page);
  const trigger = page.getByRole('button', { name: 'Cadastrar categoria' });
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('textbox', { name: /^Nome da categoria/ }).fill('Categoria Focus F033');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar categoria' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused();
  await page.getByRole('tab', { name: 'Categorias', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir categoria Categoria Focus F033', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: 'Excluir categoria Categoria Focus F033', exact: true })).toHaveCount(0);
});
