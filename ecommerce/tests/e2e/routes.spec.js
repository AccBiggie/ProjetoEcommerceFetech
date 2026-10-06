const { test, expect } = require('@playwright/test');
const { password, categories, productData } = require('../fixtures');

async function login(page, email = 'user@routes.example.com', secret = password) {
    await page.goto('/login');
    await page.locator('.loginForm input[type=email]').fill(email);
    await page.locator('.loginForm input[type=password]').fill(secret);
    await page.locator('.loginForm input[type=submit]').click();
    await expect(page).not.toHaveURL(/\/login/);
}
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test('rotas públicas, categorias, busca com caracteres especiais, paginação e páginas inexistentes', async ({ page }) => {
    for (const category of categories) {
        await page.goto('/');
        await page.getByRole('button', { name: 'Compre por departamento' }).click();
        await page.getByRole('link', { name: category, exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'Categoria' })).toHaveValue(category);
        await expect(page.locator('.products .productCard')).toHaveCount(category === 'Hardware' ? 3 : 1);
    }
    await page.goto('/products');
    await expect(page.locator('.products .productCard')).toHaveCount(12);
    await page.locator('.paginationBox').getByText('2', { exact: true }).click();
    await expect(page.locator('.products .productCard')).toHaveCount(1);
    await page.goto('/search');
    await page.getByPlaceholder('Pesquisar Produtos...').last().fill('Teste & / Pesquisa');
    await page.locator('.searchBox').last().getByRole('button').click();
    await expect(page.locator('.products .productCard')).toHaveCount(1);
    await expect(page.locator('.productName')).toHaveText('Teste & / Pesquisa');
    await page.goto('/products/Notebooks');
    await expect(page.locator('.products .productCard')).toHaveCount(1);
    await page.goto('/products?keyword=nao-existe');
    await expect(page.getByText('Nenhum produto encontrado.')).toBeVisible();
    await page.goto('/product/invalid');
    await expect(page.getByRole('alert')).toContainText('Identificador inválido');
    await page.goto('/product/000000000000000000000001');
    await expect(page.getByRole('alert')).toContainText('Produto não encontrado');
    await page.goto('/rota-inexistente');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.goto('/sad'); await expect(page).toHaveURL(/\/$/);
});

test('rotas privadas, login incorreto, retorno ao destino e restrição do dashboard', async ({ page }) => {
    await page.goto('/account'); await expect(page).toHaveURL(/\/login/);
    await page.locator('.loginForm input[type=email]').fill('user@routes.example.com');
    await page.locator('.loginForm input[type=password]').fill('incorreta');
    await page.locator('.loginForm input[type=submit]').click();
    await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
    await page.locator('.loginForm input[type=password]').fill(password);
    await page.locator('.loginForm input[type=submit]').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
    await page.goto('/dashboard'); await expect(page).toHaveURL(/\/account$/);
    await page.goto('/orders'); await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
    await page.goto('/me/update'); await expect(page.getByRole('heading', { name: 'Configurações do perfil.' })).toBeVisible();
    await page.getByPlaceholder('Name', { exact: true }).fill('Cliente E2E');
    await page.locator('.updateProfileBtn').click();
    await expect(page).toHaveURL(/\/account$/); await expect(page.getByText('Cliente E2E', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'SpeedDial tooltip example' }).hover();
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
    await expect(page.getByRole('button', { name: 'SpeedDial tooltip example' })).toHaveCount(0);
    await page.goto('/account'); await expect(page).toHaveURL(/\/login/);
});

test('menu em tela pequena e navegação por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Compre por departamento' });
    await button.click(); await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape'); await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click(); await page.getByRole('link', { name: 'Segurança', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Categoria' })).toHaveValue('Segurança');
    await expect(page.locator('.products .productCard')).toHaveCount(1);
});

test('cadastro, alteração de senha, recuperação e redefinição pelo link', async ({ page, request }) => {
    const email = 'browser-new@routes.example.com';
    await page.goto('/login'); await page.getByText('REGISTER', { exact: true }).click();
    await page.locator('.signUpForm input[name=name]').fill('Cliente navegador');
    await page.locator('.signUpForm input[name=email]').fill(email);
    await page.locator('.signUpForm input[name=password]').fill(password);
    await page.locator('.signUpBtn').click(); await expect(page).toHaveURL(/\/$/);
    await page.goto('/password/update');
    await page.getByPlaceholder('Senha antiga.').fill(password);
    await page.getByPlaceholder('Nova senha.').fill('NovaSenhaBrowser123!');
    await page.getByPlaceholder('Confirmar senha.').fill('NovaSenhaBrowser123!');
    await page.locator('.updatePasswordBtn').click(); await expect(page).toHaveURL(/\/account$/);
    await page.context().clearCookies();
    await page.goto('/password/forgot');
    await page.locator('.forgotPasswordEmail input').fill(email);
    await page.locator('.forgotPasswordBtn').click();
    await expect(page.getByText(/Email send to/)).toBeVisible();
    const reset = await (await request.get('/__test/reset-link?email=' + encodeURIComponent(email))).json();
    await page.goto(reset.url);
    await page.getByPlaceholder('New Password').fill('ResetBrowser123!');
    await page.getByPlaceholder('Confirm Password').fill('ResetBrowser123!');
    await page.locator('.resetPasswordBtn').click(); await expect(page).toHaveURL(/\/account$/);
    await page.context().clearCookies(); await login(page, email, 'ResetBrowser123!');
});

test('carrinho com dois produtos, remoção, persistência, checkout e detalhe do pedido', async ({ page }) => {
    await page.goto('/products?category=Hardware');
    await expect(page.locator('.buttomCard')).toHaveCount(3);
    await page.locator('.buttomCard').nth(0).click();
    await page.locator('.buttomCard').nth(1).click();
    await page.getByRole('link', { name: 'Carrinho', exact: true }).click();
    await expect(page.locator('.cartContainer')).toHaveCount(2);
    await page.locator('.cartContainer').first().getByRole('button', { name: '+', exact: true }).click();
    await expect(page.locator('.cartContainer').first().locator('input')).toHaveValue('2');
    await expect(page.locator('.cartContainer').last().locator('a')).toBeVisible();
    await page.reload(); await expect(page.locator('.cartContainer')).toHaveCount(2);
    await page.locator('.cartContainer').last().getByRole('button', { name: 'Remover' }).click();
    await expect(page.locator('.cartContainer')).toHaveCount(1);
    await page.getByRole('button', { name: 'Finalizar pedido' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.locator('.loginForm input[type=email]').fill('user@routes.example.com');
    await page.locator('.loginForm input[type=password]').fill(password);
    await page.locator('.loginForm input[type=submit]').click(); await expect(page).toHaveURL(/\/shipping$/);
    for (const [label, value] of Object.entries({ 'Endereço': 'Rua Teste, 10', 'Cidade': 'Maringá', 'Estado': 'PR', 'País': 'Brasil', 'CEP': '87000000', 'Telefone': '44999999999' })) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Criar pedido', exact: true }).click();
    await expect(page).toHaveURL(/\/order\/[a-f0-9]{24}$/);
    await expect(page.getByText('Pagamento: Pendente')).toBeVisible();
    const orderURL = page.url(); await page.reload(); await expect(page.getByRole('heading', { name: 'Detalhes do pedido' })).toBeVisible();
    await page.getByRole('link', { name: 'Meus pedidos', exact: true }).click();
    await expect(page.locator('table a')).toHaveCount(1);
    await page.goto('/cart'); await expect(page.getByText('Sem produtos no carrinho.')).toBeVisible();
    await page.context().clearCookies(); await login(page, 'other@routes.example.com'); await page.goto(orderURL);
    await expect(page.getByRole('alert')).toContainText('Você não pode acessar este pedido');
});

test('detalhe do produto, avaliações e exclusão de avaliação', async ({ page }) => {
    await login(page, 'other@routes.example.com');
    await page.goto('/products?category=Notebooks'); await page.locator('.productCard').click();
    await page.getByLabel('Comentário').fill('Avaliação pelo navegador');
    await page.getByRole('button', { name: 'Enviar comentário' }).click();
    await expect(page.getByText('Avaliação pelo navegador', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remover avaliação' }).click();
    await expect(page.getByText('Sem Reviews')).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar ao Carrinho' }).click();
    await page.goto('/cart'); await expect(page.locator('.cartContainer')).toHaveCount(1);
});

test('dashboard: criar, editar e excluir produto; usuários e transições de pedido', async ({ page }) => {
    await login(page, 'admin@routes.example.com'); await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Painel administrativo' })).toBeVisible();
    await page.getByLabel('Nome', { exact: true }).fill('Produto administrativo E2E');
    await page.getByLabel('Descrição', { exact: true }).fill('Produto temporário');
    await page.getByLabel('Preço', { exact: true }).fill('150');
    await page.getByRole('button', { name: 'Salvar produto' }).click();
    const row = page.getByRole('row').filter({ hasText: 'Produto administrativo E2E' });
    await expect(row).toBeVisible(); await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Preço', { exact: true }).fill('175'); await page.getByRole('button', { name: 'Salvar produto' }).click();
    await expect(row).toContainText('175,00');
    page.on('dialog', dialog => dialog.accept()); await row.getByRole('button', { name: 'Excluir', exact: true }).click(); await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Usuários', exact: true }).click();
    const role = page.getByLabel('Perfil de other@routes.example.com'); await role.selectOption('admin'); await expect(role).toBeEnabled(); await expect(role).toHaveValue('admin'); await role.selectOption('user'); await expect(role).toBeEnabled(); await expect(role).toHaveValue('user');
    const products = await (await page.request.get('/api/v1/products')).json();
    const createdOrder = await (await page.request.post('/api/v1/order/new', { data: { shippingInfo: { address: 'Rua Admin', city: 'Maringá', state: 'PR', country: 'Brasil', pinCode: 87000000, phoneNo: 44999999999 }, orderItems: [{ product: products.products[0]._id, quantity: 1 }] } })).json();
    await page.reload();
    await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
    const orderRow = page.getByRole('row').filter({ hasText: createdOrder.order._id });
    await orderRow.getByRole('button', { name: 'Marcar enviado' }).click();
    await expect(orderRow).toContainText('Enviado');
    await orderRow.getByRole('button', { name: 'Marcar entregue' }).click();
    await expect(orderRow).toContainText('Entregue');
    await orderRow.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(orderRow).toHaveCount(0);
});

test('carrossel atualizado: imagens, controles e título do produto', async ({ page }) => {
    await login(page, 'admin@routes.example.com');
    const response = await page.request.post('/api/v1/product/new', { data: productData({
        name: 'Produto com duas imagens',
        images: [{ public_id: 'first', url: '/Profile.png', banner: '/Profile.png' }, { public_id: 'second', url: '/logo192.png', banner: '/logo192.png' }],
    }) });
    expect(response.status()).toBe(201);
    const { product } = await response.json();
    try {
        await page.goto('/product/' + product._id);
        await expect(page).toHaveTitle(product.name + ' --Ecommerce');
        const gallery = page.getByRole('region', { name: 'Imagens do produto' });
        await expect(gallery.getByRole('img')).toHaveCount(2);
        await expect(gallery.getByRole('button', { name: 'Imagem anterior' })).toBeDisabled();
        await gallery.getByRole('button', { name: 'Próxima imagem' }).click();
        await expect(gallery.getByRole('button', { name: 'Próxima imagem' })).toBeDisabled();
        await gallery.getByRole('button', { name: 'Imagem anterior' }).click();
        await expect(gallery.getByRole('button', { name: 'Imagem anterior' })).toBeDisabled();
    } finally {
        expect((await page.request.delete('/api/v1/product/' + product._id)).status()).toBe(200);
    }
});
