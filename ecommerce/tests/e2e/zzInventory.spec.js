const { test, expect } = require('@playwright/test');
const { productData, password } = require('../fixtures');
const { mutation, installSecurityChecks } = require('./securityChecks');
installSecurityChecks(test, expect);
test('estoque: carrinho desatualizado recebe 409, preserva itens e encerra somente a tentativa terminal', async ({page,request}) => {
    const admin={request};
    expect((await mutation(admin,'post','/api/v1/login',{data:{email:'admin@routes.example.com',password}})).status()).toBe(200);
    const created=await mutation(admin,'post','/api/v1/product/new',{data:productData({name:'Última unidade fixture',Stock:1})});
    expect(created.status()).toBe(201);const product=(await created.json()).product;
    expect((await mutation(page,'post','/api/v1/login',{data:{email:'inventory@routes.example.com',password}})).status()).toBe(200);
    const shipping={recipientName:'Fixture',address:'Rua Teste',number:'001A',complement:'',neighborhood:'Centro',city:'Curitiba',state:'PR',country:'Brasil',pinCode:'01234567',phoneNo:'04123456789'};
    await page.goto('/products');
    await page.evaluate(({product,shipping})=>{
        localStorage.setItem('cartItems',JSON.stringify([{product:product._id,name:product.name,priceCents:product.priceCents,price:product.price,image:product.images[0].url,stock:1,quantity:1}]));
        localStorage.setItem('shippingInfo',JSON.stringify(shipping));
    },{product,shipping});
    // Outra intenção legítima leva a última unidade depois do carrinho ser formado.
    const first=await mutation(admin,'post','/api/v1/order/new',{headers:{'Idempotency-Key':require('node:crypto').randomUUID()},data:{shippingInfo:shipping,orderItems:[{product:product._id,quantity:1}]}});
    expect(first.status()).toBe(201);expect((await first.json()).order.inventoryStatus).toBe('RESERVED');
    await page.goto('/shipping');
    const rejected=page.waitForResponse(r=>r.url().endsWith('/api/v1/order/new')&&r.status()===409);
    await page.getByRole('button',{name:'Criar pedido',exact:true}).click();const response=await rejected;
    expect((await response.json()).code).toBe('ORDER_INSUFFICIENT_STOCK');const oldKey=response.request().headers()['idempotency-key'];
    await expect(page.getByRole('alert').filter({hasText:'Estoque insuficiente'})).toContainText('Estoque insuficiente para um ou mais produtos.');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartItems')))).toHaveLength(1);
    expect(await page.evaluate(()=>sessionStorage.getItem('fetech.orderAttempt.v1'))).toBeNull();
    expect((await mutation(admin,'put','/api/v1/product/'+product._id,{data:{Stock:1}})).status()).toBe(200);
    const retried=page.waitForResponse(r=>r.url().endsWith('/api/v1/order/new')&&r.status()===201);
    await page.getByRole('button',{name:'Criar pedido',exact:true}).click();const final=await retried;
    expect(final.request().headers()['idempotency-key']).not.toBe(oldKey);
    await expect(page).toHaveURL(/\/order\/[a-f0-9]+$/);
});
