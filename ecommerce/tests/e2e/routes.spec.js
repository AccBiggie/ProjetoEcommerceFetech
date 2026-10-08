const { test, expect } = require("@playwright/test");
const { password, categories, productData } = require("../fixtures");

async function login(
  page,
  email = "user@routes.example.com",
  secret = password,
) {
  await page.goto("/login");
  await page.locator(".loginForm input[type=email]").fill(email);
  await page.locator(".loginForm input[type=password]").fill(secret);
  await page.locator(".loginForm button[type=submit]").click();
  await expect(page).not.toHaveURL(/\/login/);
}
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test("rotas públicas, categorias, busca com caracteres especiais, paginação e páginas inexistentes", async ({
  page,
}) => {
  for (const category of categories) {
    await page.goto("/");
    await page.getByRole("button", { name: "Compre por departamento" }).click();
    await page.getByRole("link", { name: category, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveValue(
      category,
    );
    await expect(page.locator(".products .productCard")).toHaveCount(
      category === "Hardware" ? 3 : 1,
    );
  }
  await page.goto("/products");
  await expect(page.locator(".products .productCard")).toHaveCount(12);
  await page.locator(".paginationBox").getByText("2", { exact: true }).click();
  await expect(page.locator(".products .productCard")).toHaveCount(1);
  await page.goto("/search");
  await page
    .getByPlaceholder("Pesquisar Produtos...")
    .last()
    .fill("Teste & / Pesquisa");
  await page.locator(".searchBox").last().getByRole("button").click();
  await expect(page.locator(".products .productCard")).toHaveCount(1);
  await expect(page.locator(".productName")).toHaveText("Teste & / Pesquisa");
  await page.goto("/products/Notebooks");
  await expect(page.locator(".products .productCard")).toHaveCount(1);
  await page.goto("/products?keyword=nao-existe");
  await expect(page.getByText("Nenhum produto encontrado.")).toBeVisible();
  await page.goto("/product/invalid");
  await expect(page.getByRole("alert")).toContainText("Identificador inválido");
  await page.goto("/product/000000000000000000000001");
  await expect(page.getByRole("alert")).toContainText("Produto não encontrado");
  await page.goto("/rota-inexistente");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
  await page.goto("/sad");
  await expect(page).toHaveURL(/\/$/);
});

test("rotas privadas, login incorreto, retorno ao destino e restrição do dashboard", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  await page
    .locator(".loginForm input[type=email]")
    .fill("user@routes.example.com");
  await page.locator(".loginForm input[type=password]").fill("incorreta");
  await page.locator(".loginForm button[type=submit]").click();
  await expect(
    page.getByText("Invalid email or password", { exact: true }),
  ).toBeVisible();
  await page.locator(".loginForm input[type=password]").fill(password);
  await page.locator(".loginForm button[type=submit]").click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Meu perfil" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Meu perfil" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { name: "Meus pedidos" }),
  ).toBeVisible();
  await page.goto("/me/update");
  await expect(
    page.getByRole("heading", { name: "Editar perfil" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Cliente E2E");
  await page.locator(".updateProfileBtn").click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Cliente E2E", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Minha conta" }).click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Minha conta" })).toHaveCount(
    0,
  );
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("menu em tela pequena e navegação por teclado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.locator('button[aria-label="Compre por departamento"]');
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await page.getByRole("link", { name: "Segurança", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveValue(
    "Segurança",
  );
  await expect(page.locator(".products .productCard")).toHaveCount(1);
});

test("cadastro, alteração de senha, recuperação e redefinição pelo link", async ({
  page,
  request,
}) => {
  const email = "browser-new@routes.example.com";
  await page.goto("/login");
  await page.getByRole("tab", { name: "Criar conta" }).click();
  await page.locator(".signUpForm input[name=name]").fill("Cliente navegador");
  await page.locator(".signUpForm input[name=email]").fill(email);
  await page.locator(".signUpForm input[name=password]").fill(password);
  await page.locator(".signUpBtn").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/password/update");
  await page.getByLabel(/^Senha atual/).fill(password);
  await page.getByLabel(/^Nova senha/).fill("NovaSenhaBrowser123!");
  await page.getByLabel(/^Confirmar senha/).fill("NovaSenhaBrowser123!");
  await page.locator(".updatePasswordBtn").click();
  await expect(page).toHaveURL(/\/account$/);
  await page.context().clearCookies();
  await page.goto("/password/forgot");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(email);
  await page.locator(".forgotPasswordBtn").click();
  await expect(page.getByRole("alert")).toContainText("Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha.");
  const reset = await (
    await request.get("/__test/reset-link?email=" + encodeURIComponent(email))
  ).json();
  await page.goto(reset.url);
  await page.getByLabel(/^Nova senha/).fill("ResetBrowser123!");
  await page.getByLabel(/^Confirmar senha/).fill("ResetBrowser123!");
  await page.locator(".resetPasswordBtn").click();
  await expect(page).toHaveURL(/\/account$/);
  await page.context().clearCookies();
  await login(page, email, "ResetBrowser123!");
});

test("carrinho com dois produtos, remoção, persistência, checkout e detalhe do pedido", async ({
  page,
}) => {
  await page.goto("/products?category=Hardware");
  await expect(page.locator(".buttomCard")).toHaveCount(3);
  await page.locator(".buttomCard").nth(0).click();
  await page.locator(".buttomCard").nth(1).click();
  await page.getByRole("link", { name: "Carrinho", exact: true }).click();
  await expect(page.locator(".cartContainer")).toHaveCount(2);
  await page
    .locator(".cartContainer")
    .first()
    .getByRole("button", { name: "Aumentar quantidade", exact: true })
    .click();
  await expect(
    page.locator(".cartContainer").first().locator("input"),
  ).toHaveValue("2");
  await expect(
    page.locator(".cartContainer").last().locator("a"),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".cartContainer")).toHaveCount(2);
  await page
    .locator(".cartContainer")
    .last()
    .getByRole("button", { name: "Remover" })
    .click();
  await expect(page.locator(".cartContainer")).toHaveCount(1);
  await page.getByRole("button", { name: "Finalizar pedido" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page
    .locator(".loginForm input[type=email]")
    .fill("user@routes.example.com");
  await page.locator(".loginForm input[type=password]").fill(password);
  await page.locator(".loginForm button[type=submit]").click();
  await expect(page).toHaveURL(/\/shipping$/);
  for (const [label, value] of Object.entries({
    Endereço: "Rua Teste, 10",
    Cidade: "Maringá",
    Estado: "PR",
    País: "Brasil",
    CEP: "87000000",
    Telefone: "44999999999",
  }))
    await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page.getByRole("button", { name: "Criar pedido", exact: true }).click();
  await expect(page).toHaveURL(/\/order\/[a-f0-9]{24}$/);
  await expect(page.getByText("Pagamento: Pendente")).toBeVisible();
  const orderURL = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Detalhes do pedido" }),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("link", { name: "Meus pedidos", exact: true })
    .click();
  await expect(page.locator("table a")).toHaveCount(1);
  await page.goto("/cart");
  await expect(page.getByText("Sem produtos no carrinho.")).toBeVisible();
  await page.context().clearCookies();
  await login(page, "other@routes.example.com");
  await page.goto(orderURL);
  await expect(page.getByRole("alert")).toContainText(
    "Você não pode acessar este pedido",
  );
});

test("detalhe do produto, avaliações e exclusão de avaliação", async ({
  page,
}) => {
  await login(page, "other@routes.example.com");
  await page.goto("/products?category=Notebooks");
  await page.locator(".productCard").click();
  await page.getByLabel("Comentário").fill("Avaliação pelo navegador");
  await page.getByRole("button", { name: "Enviar comentário" }).click();
  await expect(
    page.getByText("Avaliação pelo navegador", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover avaliação" }).click();
  await expect(
    page.getByText("Sem avaliações. Seja o primeiro a avaliar."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao Carrinho" }).click();
  await page.goto("/cart");
  await expect(page.locator(".cartContainer")).toHaveCount(1);
});

test("dashboard: criar, editar e excluir produto; usuários e transições de pedido", async ({
  page,
}) => {
  await login(page, "admin@routes.example.com");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Painel administrativo" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Produto administrativo E2E");
  await page
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Produto temporário");
  await page
    .getByRole("spinbutton", { name: "Preço", exact: true })
    .fill("150");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).selectOption({ label: "Hardware" });
  await page.getByRole("button", { name: "Salvar produto" }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Produto administrativo E2E" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Preço", exact: true })
    .fill("175");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(row).toContainText("175,00");
  await row.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar exclusão" })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole("tab", { name: "Usuários", exact: true }).click();
  const role = page.getByLabel("Perfil de other@routes.example.com");
  await role.selectOption("admin");
  await expect(role).toBeEnabled();
  await expect(role).toHaveValue("admin");
  await role.selectOption("user");
  await expect(role).toBeEnabled();
  await expect(role).toHaveValue("user");
  const products = await (await page.request.get("/api/v1/products")).json();
  const createdOrder = await (
    await page.request.post("/api/v1/order/new", {
      data: {
        shippingInfo: {
          address: "Rua Admin",
          city: "Maringá",
          state: "PR",
          country: "Brasil",
          pinCode: 87000000,
          phoneNo: 44999999999,
        },
        orderItems: [{ product: products.products[0]._id, quantity: 1 }],
      },
    })
  ).json();
  await page.reload();
  await page.getByRole("tab", { name: "Pedidos", exact: true }).click();
  const orderRow = page
    .getByRole("row")
    .filter({ hasText: createdOrder.order._id });
  await orderRow.getByRole("button", { name: "Marcar enviado" }).click();
  await expect(orderRow).toContainText("Enviado");
  await orderRow.getByRole("button", { name: "Marcar entregue" }).click();
  await expect(orderRow).toContainText("Entregue");
  await orderRow.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar exclusão" })
    .click();
  await expect(orderRow).toHaveCount(0);
});

test("carrossel atualizado: imagens, controles e título do produto", async ({
  page,
}) => {
  await login(page, "admin@routes.example.com");
  const response = await page.request.post("/api/v1/product/new", {
    data: productData({
      name: "Produto com duas imagens",
      images: [
        { public_id: "first", url: "/Profile.png", banner: "/Profile.png" },
        { public_id: "second", url: "/logo192.png", banner: "/logo192.png" },
      ],
    }),
  });
  expect(response.status()).toBe(201);
  const { product } = await response.json();
  try {
    await page.goto("/product/" + product._id);
    await expect(page).toHaveTitle(product.name + " | Fetech");
    const gallery = page.getByRole("region", { name: "Imagens do produto" });
    await expect(gallery.getByRole("img")).toHaveCount(2);
    await expect(
      gallery.getByRole("button", { name: "Imagem anterior" }),
    ).toBeDisabled();
    await gallery.getByRole("button", { name: "Próxima imagem" }).click();
    await expect(
      gallery.getByRole("button", { name: "Próxima imagem" }),
    ).toBeDisabled();
    await gallery.getByRole("button", { name: "Imagem anterior" }).click();
    await expect(
      gallery.getByRole("button", { name: "Imagem anterior" }),
    ).toBeDisabled();
  } finally {
    expect(
      (await page.request.delete("/api/v1/product/" + product._id)).status(),
    ).toBe(200);
  }
});

test("categorias: offcanvas, subcategoria por parent_id, edição, filtros e exclusão protegida", async ({ page }) => {
  await login(page, "admin@routes.example.com");
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: "Categorias", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole("button", { name: "Cadastrar categoria" }).click();
  const drawer = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Nome da categoria" })).toBeFocused();
  await drawer.getByRole("textbox", { name: "Nome da categoria" }).fill("Departamento E2E");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await drawer.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(drawer).toHaveCount(0);
  const parentRow = page.getByRole("row").filter({ has: page.locator("td:first-child").getByText("Departamento E2E", { exact: true }) });
  await expect(parentRow).toBeVisible();
  await parentRow.getByRole("button", { name: "Adicionar subcategoria" }).click();
  await drawer.getByRole("textbox", { name: "Nome da categoria" }).fill("Subcategoria E2E");
  const { categories: initial } = await (await page.request.get("/api/v1/categories")).json();
  const parent = initial.find(category => category.name === "Departamento E2E");
  await expect(drawer.getByRole("combobox", { name: "Categoria pai" })).toHaveValue(parent._id);
  await drawer.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(drawer).toHaveCount(0);
  const { categories } = await (await page.request.get("/api/v1/categories")).json();
  const child = categories.find(category => category.name === "Subcategoria E2E");
  expect(child.parent_id).toBe(parent._id);
  await parentRow.getByRole("button", { name: "Excluir", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Excluir categoria?" });
  await confirmation.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(confirmation.getByRole("alert")).toContainText("subcategorias");
  await confirmation.getByRole("button", { name: "Cancelar" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: "Produtos", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Produto da subcategoria E2E");
  await page.getByRole("textbox", { name: "Descrição", exact: true }).fill("Produto vinculado por referência");
  await page.getByRole("spinbutton", { name: "Preço", exact: true }).fill("200");
  await page.getByRole("combobox", { name: "Categoria", exact: true }).selectOption({ label: "Departamento E2E / Subcategoria E2E" });
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Produto da subcategoria E2E" })).toBeVisible();
  await page.getByRole("tab", { name: "Categorias", exact: true }).click();
  const childRow = page.getByRole("row").filter({ has: page.locator("td:first-child").getByText("Subcategoria E2E", { exact: true }) });
  await childRow.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar categoria" });
  await expect(edit.getByRole("combobox", { name: "Categoria pai" }).locator(`option[value="${child._id}"]`)).toHaveCount(0);
  await edit.getByRole("textbox", { name: "Nome da categoria" }).fill("Subcategoria E2E editada");
  await edit.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(edit).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Categorias", exact: true }).click();
  const editedRow = page.getByRole("row").filter({ has: page.locator("td:first-child").getByText("Subcategoria E2E editada", { exact: true }) });
  await editedRow.getByRole("button", { name: "Excluir", exact: true }).click();
  await confirmation.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(confirmation.getByRole("alert")).toContainText("possui produtos");
  await confirmation.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Compre por departamento" }).click();
  await page.getByRole("link", { name: "Departamento E2E", exact: true }).click();
  await expect(page.locator(".products .productCard")).toHaveCount(1);
  await expect(page.locator(".productName")).toHaveText("Produto da subcategoria E2E");
  const products = await (await page.request.get(`/api/v1/products?category=${child._id}`)).json();
  expect(products.products[0].category).toBe("Subcategoria E2E editada");
  expect((await page.request.delete(`/api/v1/product/${products.products[0]._id}`)).status()).toBe(200);
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: "Categorias", exact: true }).click();
  await editedRow.getByRole("button", { name: "Excluir", exact: true }).click();
  await confirmation.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(editedRow).toHaveCount(0);
  await parentRow.getByRole("button", { name: "Excluir", exact: true }).click();
  await confirmation.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(parentRow).toHaveCount(0);
  await page.getByRole("button", { name: "Cadastrar categoria" }).click();
  await drawer.getByRole("textbox", { name: "Nome da categoria" }).fill("Hardware");
  await drawer.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Já existe");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cadastrar categoria" })).toBeFocused();
});

test("layout Material UI responsivo, menu da conta e navegação por teclado", async ({
  page,
}) => {
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/products", "/login", "/cart"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("search").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await login(page, "admin@routes.example.com");
  for (const route of ["/account", "/me/update", "/orders", "/dashboard"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Minha conta" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Meu perfil", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Minha conta" })).toBeFocused();
  await page.goto("/products?category=Notebooks");
  await page.locator(".productCard").first().click();
  await expect(page.locator(".ProductDetails")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Adicionar ao Carrinho", exact: true })
    .click();
  await page.goto("/cart");
  await expect(page.locator(".cartContainer")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Finalizar pedido", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Endereço de entrega" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/login");
  await page.context().clearCookies();
  await page.goto("/login");
  await page
    .locator(".loginForm input[type=password]")
    .fill("SenhaVisivel123!");
  await page
    .getByRole("button", { name: "Mostrar senha", exact: true })
    .click();
  await expect(
    page.locator(".loginForm input[autocomplete=current-password]"),
  ).toHaveAttribute("type", "text");
});

test("modo escuro: controle por teclado, persistência, sincronização e telas responsivas", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-color-mode", "light");
  await page.getByRole("button", { name: "Ativar modo escuro" }).focus();
  await page.keyboard.press("Space");
  await expect(root).toHaveAttribute("data-color-mode", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(16, 23, 34)");
  for (const logo of await page.locator(".fetech-logo").all()) await expect(logo).toHaveCSS("filter", "invert(1)");
  expect(await page.evaluate(() => localStorage.getItem("fetech-color-mode"))).toBe("dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Ativar modo claro" })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/products", "/login", "/cart"]) {
      await page.goto(route);
      await expect(root).toHaveAttribute("data-color-mode", "dark");
      await expect(page.getByRole("button", { name: "Ativar modo claro" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await login(page, "admin@routes.example.com");
  await page.goto("/dashboard");
  await expect(page.getByRole("columnheader").first()).toHaveCSS("background-color", "rgb(32, 43, 61)");
  await page.getByRole("button", { name: "Cadastrar categoria" }).click();
  const drawer = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(drawer).toHaveCSS("background-color", "rgb(24, 34, 48)");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  const otherTab = await context.newPage();
  try {
    await otherTab.goto("/");
    await expect(otherTab.locator("html")).toHaveAttribute("data-color-mode", "dark");
    await page.getByRole("button", { name: "Ativar modo claro" }).click();
    await expect(root).toHaveAttribute("data-color-mode", "light");
    await expect(otherTab.locator("html")).toHaveAttribute("data-color-mode", "light");
    await page.reload();
    await expect(root).toHaveAttribute("data-color-mode", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 250)");
  } finally { await otherTab.close(); }
});

test("tema: preferência do sistema, escolha manual e armazenamento indisponível", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await page.evaluate(() => localStorage.setItem("fetech-color-mode", "invalid"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  const restricted = await context.newPage();
  try {
    await restricted.emulateMedia({ colorScheme: "light" });
    await restricted.addInitScript(() => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) {
        if (key === "fetech-color-mode") throw new DOMException("Armazenamento bloqueado", "SecurityError");
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (key === "fetech-color-mode") throw new DOMException("Armazenamento bloqueado", "SecurityError");
        return originalSet.call(this, key, value);
      };
    });
    await restricted.goto("/");
    await restricted.getByRole("button", { name: "Ativar modo escuro" }).click();
    await expect(restricted.locator("html")).toHaveAttribute("data-color-mode", "dark");
    await restricted.getByRole("button", { name: "Ativar modo claro" }).click();
    await expect(restricted.locator("html")).toHaveAttribute("data-color-mode", "light");
  } finally { await restricted.close(); }
});
