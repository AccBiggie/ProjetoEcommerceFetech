const { test, expect } = require("@playwright/test");
const { password } = require("../fixtures");
const { installSecurityChecks, mutation } = require('./securityChecks');
installSecurityChecks(test, expect);

async function fillAddress(dialog, label) {
  const values = {
    "Identificação do endereço": label, "Nome do destinatário": "Cliente Endereços",
    "CEP": "01234-567", "Endereço": "Rua das Flores", "Número": "100",
    "Complemento": "Apartamento 2", "Bairro": "Centro", "Cidade": "São Paulo",
    "Estado": "SP", "País": "Brasil", "Telefone": "(011) 99999-9999",
  };
  for (const [name, value] of Object.entries(values)) await dialog.getByRole("textbox", { name, exact: true }).fill(value);
}

for (const width of [360, 768, 1440]) {
  test(`entrega: cards de endereços, seleção e snapshot editável em ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const registration = await mutation(page, "post", "/api/v1/register", { data: {
      name: "Cliente Checkout", email: `checkout-address-${width}@routes.example.com`, password,
    } });
    expect(registration.status()).toBe(201);
    const home = (await (await mutation(page, "post", "/api/v1/address/new", { data: {
      label: "Casa checkout", recipientName: "Cliente Checkout", address: "Rua das Flores",
      number: "100", complement: "Apartamento 2", neighborhood: "Centro", city: "São Paulo",
      state: "SP", country: "Brasil", pinCode: "01234-567", phoneNo: "(011) 99999-9999", favorite: true,
    } })).json()).address;
    const work = (await (await mutation(page, "post", "/api/v1/address/new", { data: {
      label: "Trabalho checkout", recipientName: "Cliente Checkout", address: "Avenida Brasil",
      number: "200", neighborhood: "Jardim", city: "Curitiba", state: "PR", country: "Brasil",
      pinCode: "80000-001", phoneNo: "(41) 99999-9999",
    } })).json()).address;
    await page.goto("/products");
    await page.getByRole("button", { name: "Adicionar ao Carrinho", exact: true }).first().click();
    const previous = { address: "Endereço manual anterior", city: "Cidade anterior", state: "SC", country: "Brasil", pinCode: "89000000", phoneNo: "47999999999" };
    await page.evaluate(value => localStorage.setItem("shippingInfo", JSON.stringify(value)), previous);
    await page.goto("/shipping");
    await expect(page.getByRole("textbox", { name: "Endereço", exact: true })).toHaveValue(previous.address);
    const homeRadio = page.getByRole("radio", { name: "Usar endereço Casa checkout" });
    const workRadio = page.getByRole("radio", { name: "Usar endereço Trabalho checkout" });
    await expect(homeRadio).toBeVisible();
    await expect(homeRadio).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "Preencher ou ajustar manualmente" })).toBeChecked();
    await homeRadio.focus();
    await page.keyboard.press("Space");
    await expect(homeRadio).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Endereço", exact: true })).toHaveValue("Rua das Flores");
    await expect(page.getByRole("textbox", { name: "CEP", exact: true })).toHaveValue("01234567");
    await expect(page.getByRole("textbox", { name: "Telefone", exact: true })).toHaveValue("011999999999");
    await page.getByText("Trabalho checkout", { exact: true }).click();
    await expect(workRadio).toBeChecked();
    await expect(homeRadio).not.toBeChecked();
    await expect(page.getByRole("textbox", { name: "Cidade", exact: true })).toHaveValue("Curitiba");
    await expect(page.getByRole("textbox", { name: "Endereço", exact: true })).toHaveValue("Avenida Brasil");
    const stored = await (await page.request.get("/api/v1/addresses")).json();
    expect(stored.addresses.find(address => address._id === home._id).favorite).toBe(true);
    expect(stored.addresses.find(address => address._id === work._id).favorite).toBe(false);
    await homeRadio.check();
    await page.getByRole("textbox", { name: "Cidade", exact: true }).fill("Campinas");
    await expect(homeRadio).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "Preencher ou ajustar manualmente" })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Criar pedido", exact: true }).click();
    await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
    const orderId = page.url().split("/").at(-1);
    const snapshot = (await (await page.request.get(`/api/v1/order/${orderId}`)).json()).order.shippingInfo;
    expect(snapshot.address).toBe("Rua das Flores");
    expect(snapshot.number).toBe("100");
    expect(snapshot.complement).toBe("Apartamento 2");
    expect(snapshot.neighborhood).toBe("Centro");
    expect(snapshot.recipientName).toBe("Cliente Checkout");
    expect(snapshot.pinCode).toBe("01234567");
    expect(snapshot.phoneNo).toBe("011999999999");
    expect(snapshot.city).toBe("Campinas");
    await mutation(page, "put", `/api/v1/address/${home._id}`, { data: { city: "Santos" } });
    await mutation(page, "delete", `/api/v1/address/${home._id}`);
    expect((await (await page.request.get(`/api/v1/order/${orderId}`)).json()).order.shippingInfo).toEqual(snapshot);
  });
}

test("entrega: falha ao buscar endereços mantém preenchimento manual e criação de pedido", async ({ page }) => {
  expect((await mutation(page, "post", "/api/v1/register", { data: { name: "Cliente Manual", email: "manual-checkout@routes.example.com", password } })).status()).toBe(201);
  await page.goto("/products");
  await page.getByRole("button", { name: "Adicionar ao Carrinho", exact: true }).first().click();
  await page.route("**/api/v1/addresses", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "Serviço temporariamente indisponível." }) }));
  await page.goto("/shipping");
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar seus endereços" })).toBeVisible();
  for (const [label, value] of [["Nome do destinatário", "Cliente Manual"], ["Número", "S/N"], ["Bairro", "Centro"], ["Endereço", "Rua Manual"], ["Cidade", "São Paulo"], ["Estado", "SP"], ["País", "Brasil"], ["CEP", "01234567"], ["Telefone", "11999999999"]]) {
    await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Criar pedido", exact: true }).click();
  await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
});

for (const width of [360, 768, 1440]) {
  test(`meus endereços: conta, CRUD, favorito e formulário responsivo em ${width} px`, async ({ page, context }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const email = `addresses-${width}@routes.example.com`;
    const registration = await mutation(page, "post", "/api/v1/register", { data: { name: "Cliente Endereços", email, password } });
    expect(registration.status()).toBe(201);
    await context.clearCookies();
    await page.goto("/addresses");
    await expect(page).toHaveURL(/\/login/);
    await page.locator(".loginForm input[type=email]").fill(email);
    await page.locator(".loginForm input[type=password]").fill(password);
    await page.locator(".loginForm button[type=submit]").click();
    await expect(page).toHaveURL(/\/addresses$/);
    await expect(page.getByText("Você ainda não tem endereços cadastrados.")).toBeVisible();
    await page.goto("/account");
    await page.getByRole("link", { name: "Meus endereços", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Meus endereços" })).toBeVisible();
    await page.getByRole("button", { name: "Minha conta" }).click();
    await page.getByRole("menuitem", { name: "Meus endereços", exact: true }).click();
    await expect(page).toHaveURL(/\/addresses$/);
    if (width === 360) {
      const darkButton = page.getByRole("button", { name: "Ativar modo escuro" });
      if (await darkButton.count()) await darkButton.click();
    }
    const shipping = { address: "Endereço do checkout", pinCode: "00000001", phoneNo: "011999999999" };
    await page.evaluate(value => localStorage.setItem("shippingInfo", JSON.stringify(value)), shipping);
    await page.getByRole("button", { name: "Adicionar endereço", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Adicionar endereço" });
    await expect(create.getByRole("textbox", { name: "Identificação do endereço" })).toBeFocused();
    await fillAddress(create, "Casa");
    await create.getByRole("textbox", { name: "CEP", exact: true }).fill("123");
    await create.getByRole("button", { name: "Salvar endereço" }).click();
    await expect(create.getByText("Informe um CEP com 8 dígitos.")).toBeVisible();
    await create.getByRole("textbox", { name: "CEP", exact: true }).fill("01234-567");
    await create.getByRole("checkbox", { name: "Definir como favorito" }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await create.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(width);
    await create.getByRole("button", { name: "Salvar endereço" }).click();
    await expect(create).toHaveCount(0);
    const home = page.getByRole("article", { name: "Casa", exact: true });
    await expect(home).toContainText("CEP 01234-567");
    await expect(home.getByText("Favorito", { exact: true })).toBeVisible();
    await home.getByRole("button", { name: "Editar", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Editar endereço" });
    await edit.getByRole("textbox", { name: "Número", exact: true }).fill("200A");
    await edit.getByRole("button", { name: "Salvar endereço" }).click();
    await expect(edit).toHaveCount(0);
    await expect(home).toContainText("Rua das Flores, 200A");
    await page.getByRole("button", { name: "Adicionar endereço", exact: true }).click();
    await fillAddress(create, "Trabalho");
    await create.getByRole("button", { name: "Salvar endereço" }).click();
    await expect(create).toHaveCount(0);
    const work = page.getByRole("article", { name: "Trabalho", exact: true });
    await expect(page.getByRole("article")).toHaveCount(2);
    await work.getByRole("button", { name: "Tornar favorito", exact: true }).click();
    await expect(work.getByText("Favorito", { exact: true })).toBeVisible();
    await expect(home.getByText("Favorito", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Favorito", { exact: true })).toHaveCount(1);
    await page.reload();
    await expect(work.getByText("Favorito", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shippingInfo")).data)).toEqual(shipping);
    await home.getByRole("button", { name: "Excluir", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Excluir endereço?" });
    await confirmation.getByRole("button", { name: "Cancelar" }).click();
    await expect(home).toBeVisible();
    for (const card of [home, work]) {
      await card.getByRole("button", { name: "Excluir", exact: true }).click();
      await confirmation.getByRole("button", { name: "Confirmar exclusão" }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(card).toHaveCount(0);
    }
    await expect(page.getByText("Você ainda não tem endereços cadastrados.")).toBeVisible();
    expect((await (await page.request.get("/api/v1/addresses")).json()).addresses).toEqual([]);
    expect(errors).toEqual([]);
  });
}
