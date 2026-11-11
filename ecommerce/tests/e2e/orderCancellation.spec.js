const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto'), fs = require('node:fs'), mongoose = require('mongoose');
const { login, settle, expectNoA11yViolations } = require('../helpers/accessibility');
const { installSecurityChecks, mutation } = require('./securityChecks');
const { context } = require('../helpers/e2eContext');
installSecurityChecks(test, expect);
test.beforeAll(async () => {
  const settings = JSON.parse(fs.readFileSync(context().state,'utf8'));
  expect(settings.uri).toBe(require('../replicaSetHarness').testUri(settings.database));
  await mongoose.connect(settings.uri);
});
test.afterAll(async () => { await mongoose.disconnect(); });
async function create(page) {
  await login(page,'cancellation');
  const product = (await (await page.request.get('/api/v1/products?keyword=Produto%20extra')).json()).products[0];
  const response = await mutation(page,'post','/api/v1/order/new',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{
    shippingInfo:{recipientName:'Fixture',address:'Rua Fixture',number:'01A',complement:'',neighborhood:'Centro',city:'Curitiba',state:'PR',country:'Brasil',pinCode:'01234567',phoneNo:'04123456789'},
    orderItems:[{product:product._id,quantity:2}],
  }});
  expect(response.status()).toBe(201); return { order:(await response.json()).order,product, stock:product.Stock };
}
const rowFor = (page,id) => page.getByRole('row').filter({hasText:id});
async function artifacts(id) {
  const entityId = new mongoose.Types.ObjectId(id), db = mongoose.connection.db;
  return { releases:await db.collection('stockmovements').countDocuments({order:entityId,type:'RELEASE'}),events:await db.collection('emailoutboxes').countDocuments({entityId,eventType:'ORDER_CANCELLED'}) };
}
test('cancelamento cliente: dialog teclado/foco, double click, release, histórico e reload',async({page})=>{
  const {order,product,stock}=await create(page); await page.goto('/orders'); const row=rowFor(page,order._id); const trigger=row.getByRole('button',{name:/Cancelar pedido/});
  await trigger.click(); const dialog=page.getByRole('dialog',{name:'Cancelar este pedido?'});
  const back=dialog.getByRole('button',{name:'Voltar'}), confirm=dialog.getByRole('button',{name:'Confirmar cancelamento'});
  await expect(back).toBeFocused(); await page.keyboard.press('Tab'); await expect(confirm).toBeFocused(); await page.keyboard.press('Tab'); await expect(back).toBeFocused();
  await expectNoA11yViolations(page,'cancelamento dialog'); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); let release; const held=new Promise(r=>release=r); let calls=0;
  await page.route('**/api/v1/order/'+order._id+'/cancel',async route=>{calls++;await held;await route.continue();});
  await confirm.evaluate(button=>{button.click();button.click();}); await expect(dialog.getByRole('status')).toHaveText('Cancelando…');
  await expect(dialog.getByRole('button',{name:'Cancelando…'})).toBeDisabled(); release();
  await expect(dialog).toHaveCount(0); await expect(row).toContainText('Cancelado'); await expect(trigger).toHaveCount(0); expect(calls).toBe(1);
  expect((await mongoose.connection.db.collection('products').findOne({_id:new mongoose.Types.ObjectId(product._id)})).Stock).toBe(stock);
  expect(await artifacts(order._id)).toEqual({releases:1,events:1}); await expectNoA11yViolations(page,'cancelamento concluído');
  await page.reload(); await expect(row).toContainText('Cancelado'); await row.getByRole('link',{name:order._id}).click();
  await expect(page.getByText('Cancelado',{exact:true})).toBeVisible(); await expect(page.getByText(/^Cancelado em /)).toBeVisible();
  await expect(page.getByRole('button',{name:/Cancelar pedido/})).toHaveCount(0);
});
test('cancelamento admin usa mesma regra e preserva arquivamento',async({page})=>{
  const {order}=await create(page), second=(await create(page)).order; await login(page,'admin'); await page.goto('/dashboard'); await page.getByRole('tab',{name:'Pedidos',exact:true}).click();
  const row=rowFor(page,order._id); await row.getByRole('button',{name:/Cancelar pedido/}).click();
  await expectNoA11yViolations(page,'cancelamento admin dialog'); await page.getByRole('button',{name:'Confirmar cancelamento'}).click();
  await expect(row).toContainText('Cancelado'); await expect(row.getByRole('button',{name:/Marcar enviado|Marcar entregue/})).toHaveCount(0);
  await row.getByRole('button',{name:/^Arquivar pedido/}).click(); await page.getByRole('button',{name:'Confirmar arquivamento'}).click();
  await expect(row).toHaveCount(0); await page.getByLabel('Filtrar pedidos').selectOption('archived'); await expect(row).toContainText('Cancelado'); await expect(row).toContainText('Arquivado');
  expect(await artifacts(order._id)).toEqual({releases:1,events:1});
  expect(await mongoose.connection.db.collection('adminauditevents').countDocuments({targetId:new mongoose.Types.ObjectId(order._id),action:'ORDER_CANCELLED'})).toBe(1);
  await page.goto('/order/'+second._id); await page.getByRole('button',{name:/Cancelar pedido/}).click(); await page.getByRole('button',{name:'Confirmar cancelamento'}).click();
  await expect(page.getByText('Cancelado',{exact:true})).toBeVisible(); expect(await artifacts(second._id)).toEqual({releases:1,events:1});
});
for(const status of ['PAID','Shipped']) test('cancelamento bloqueado UI/API '+status,async({page})=>{
  const {order}=await create(page); await require('../helpers/orderPaymentFixture').markOrderPaidFixture(order._id);
  if(status==='Shipped') await mongoose.connection.db.collection('orders').updateOne({_id:new mongoose.Types.ObjectId(order._id)},{$set:{orderStatus:'Shipped'}});
  await page.goto('/order/'+order._id); await settle(page); await expect(page.getByRole('button',{name:/Cancelar pedido/})).toHaveCount(0);
  const reply=await mutation(page,'post','/api/v1/order/'+order._id+'/cancel',{data:{}}); expect(reply.status()).toBe(409);
  expect((await reply.json()).code).toBe(status==='PAID'?'ORDER_REFUND_REQUIRED':'ORDER_RETURN_REQUIRED'); expect(await artifacts(order._id)).toEqual({releases:0,events:0});
});
test('cancelamento stale eligibility anuncia conflito sem promessa de refund',async({page})=>{
  const {order}=await create(page); await page.goto('/order/'+order._id); await page.getByRole('button',{name:/Cancelar pedido/}).click();
  await require('../helpers/orderPaymentFixture').markOrderPaidFixture(order._id);
  await page.getByRole('button',{name:'Confirmar cancelamento'}).click(); const alert=page.getByRole('dialog').getByRole('alert');
  await expect(alert).toContainText('pagamento confirmado'); await expectNoA11yViolations(page,'cancelamento conflito');
  expect(await artifacts(order._id)).toEqual({releases:0,events:0});
});
test('cancelamento sobrevive resposta atrasada de listagem paginada',async({page})=>{
  const {order}=await create(page); let release, reached; const held=new Promise(r=>release=r), ready=new Promise(r=>reached=r);
  await page.route('**/api/v1/orders/me?*',async route=>{
    const response=await route.fetch(), body=await response.json();
    const pageNumber=new URL(route.request().url()).searchParams.get('page');
    if(pageNumber==='2'){reached();await held;}
    body.pagination={...body.pagination,pages:2,page:Number(pageNumber),total:26};
    if(pageNumber==='2') body.orders=[{...order,cancellation:{canCancel:true,blockedReason:null}}];
    await route.fulfill({response,json:body});
  });
  await page.goto('/orders'); const row=rowFor(page,order._id); await expect(row).toBeVisible(); await page.getByRole('button',{name:'Ir para a página 2',exact:true}).click(); await ready;
  await row.getByRole('button',{name:/Cancelar pedido/}).click(); await page.getByRole('button',{name:'Confirmar cancelamento'}).click(); await expect(row).toContainText('Cancelado');
  release(); await settle(page); await expect(row).toContainText('Cancelado'); await expect(row.getByRole('button',{name:/Cancelar pedido/})).toHaveCount(0);
});
