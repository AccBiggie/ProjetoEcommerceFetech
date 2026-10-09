const {test,expect}=require('@playwright/test');
const {password}=require('../fixtures');
const {installSecurityChecks,mutation}=require('./securityChecks');
const fixture=require('../helpers/paginationE2EFixture');
installSecurityChecks(test,expect);
let ids;
test.beforeAll(async()=>{ids=await fixture.seed();});
test.afterAll(async()=>{if(ids) await fixture.cleanup(ids);});
async function login(page,email='admin@routes.example.com') {
    expect((await mutation(page,'post','/api/v1/login',{data:{email,password}})).status()).toBe(200);
}
test('catálogo navega página 1/2/voltar e filtro reinicia página',async({page})=>{
    const requests=[]; page.on('request',request=>{if(new URL(request.url()).pathname==='/api/v1/products') requests.push(new URL(request.url()));});
    await page.goto('/products');
    const nav=page.getByRole('navigation',{name:'Navegar pela paginação'});
    await nav.getByRole('button',{name:'Ir para a página 2',exact:true}).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('link',{name:/Paginação fixture 17/}).first()).toBeVisible();
    await nav.getByRole('button',{name:'Ir para a página 1',exact:true}).click();
    await expect(page).toHaveURL(/page=1/);
    await nav.getByRole('button',{name:'Ir para a página 2',exact:true}).click();
    await page.getByLabel('Categoria', {exact:true}).selectOption({index:1});
    await expect(page).not.toHaveURL(/page=2/);
    expect(requests.some(url=>url.searchParams.get('page')==='2')).toBe(true);
    expect(requests.every(url=>Number(url.searchParams.get('page'))<=2)).toBe(true);
});
for(const [tab,label,filter] of [['Produtos','products',null],['Usuários','users','Filtrar usuários'],['Pedidos','orders','Filtrar pedidos']]) test('admin '+tab+' consome página e filtro reinicia',async({page})=>{
    await login(page); await page.goto('/dashboard'); await page.getByRole('tab',{name:tab,exact:true}).click();
    const nav=page.getByRole('navigation',{name:'Paginação de '+label});
    const response=page.waitForResponse(reply=>{const url=new URL(reply.url());return url.pathname==='/api/v1/admin/'+label&&url.searchParams.get('page')==='2';});
    await nav.getByRole('button',{name:'Ir para a página 2',exact:true}).click();
    const data=await(await response).json();expect(data.pagination.page).toBe(2);expect(data[label].length).toBeLessThanOrEqual(25);
    if(filter) {
        const reset=page.waitForResponse(reply=>{const url=new URL(reply.url());return url.pathname==='/api/v1/admin/'+label&&url.searchParams.get('page')==='1';});
        await page.getByLabel(filter).selectOption('all'); expect((await(await reset).json()).pagination.page).toBe(1);
    }
});
test('cliente navega histórico paginado sem snapshot na listagem',async({page})=>{
    await login(page,'user@routes.example.com'); await page.goto('/orders');
    const response=page.waitForResponse(reply=>new URL(reply.url()).pathname==='/api/v1/orders/me'&&new URL(reply.url()).searchParams.get('page')==='2');
    await page.getByRole('navigation',{name:'Paginação dos meus pedidos'}).getByRole('button',{name:'Ir para a página 2',exact:true}).click();
    const data=await(await response).json();expect(data.orders.length).toBeLessThanOrEqual(25);expect(data.orders[0].shippingInfo).toBeUndefined();
    await expect(page.getByRole('link',{name:data.orders[0]._id,exact:true})).toBeVisible();
});
test('resposta antiga do catálogo não sobrescreve página nova',async({page})=>{
    let release; const gate=new Promise(resolve=>release=resolve);
    await page.route('**/api/v1/products?**',async route=>{
        const url=new URL(route.request().url()); const first=url.searchParams.get('page')==='1';
        if(first) await gate;
        try { await route.fulfill({json:{success:true,products:[{_id:first?'111111111111111111111111':'222222222222222222222222',name:first?'Resposta antiga':'Resposta atual',priceCents:100,oldPriceCents:null,installmmentPriceCents:8,images:[{url:'/Profile.png'}],ratings:0}],productsCount:24,filteredProductsCount:24,resultPerPage:12,pagination:{page:first?1:2,limit:12,total:24,pages:2}}}); } catch {}
    });
    await page.goto('/products');
    // Client navigation preserves the same store and pending request.
    await page.evaluate(()=>{history.pushState({},'', '/products?page=2');window.dispatchEvent(new PopStateEvent('popstate'));});
    await expect(page.getByText('Resposta atual',{exact:true})).toBeVisible();
    release(); await expect(page.getByText('Resposta antiga',{exact:true})).toHaveCount(0);
});
