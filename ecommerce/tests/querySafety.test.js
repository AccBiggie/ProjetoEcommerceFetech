const { test, before, after }=require('node:test');
const assert=require('node:assert/strict');
const paging=require('../backend/utils/pagination');
const fixture=require('./helpers/productHarness');
let env;
before(async()=>{env=await fixture.start();});
after(async()=>{if(env) await env.stop();});
for(const value of ['0','-1','1.2','NaN','Infinity','abc','1e3',' 1','+1','01','9007199254740992',[],{},1]) for(const field of ['page','limit']) test(`parser rejeita ${field} ${JSON.stringify(value)}`,()=>assert.throws(()=>paging.parsePagination({[field]:value}),{statusCode:400}));
test('skip máximo exato e overflow seguro',()=>{
    assert.equal(paging.parsePagination({page:'100001',limit:'1'}).skip,100000);
    assert.throws(()=>paging.parsePagination({page:'100002',limit:'1'}),{code:'PAGINATION_RANGE_TOO_LARGE'});
    assert.throws(()=>paging.parsePagination({page:'9007199254740991',limit:'100'}),{code:'PAGINATION_RANGE_TOO_LARGE'});
});
const queries=['page=0','limit=101','page=1&page=2','limit=1&limit=2','page[]=1','limit[$gt]=1','sort[$ne]=1','sort=name','unknown=1','page=Infinity'];
for(const route of ['/products','/admin/products','/admin/users','/orders/me','/admin/orders','/admin/audit-events']) for(const query of queries) test(`${route} rejeita ${query}`,async()=>{await env.request('GET',route+'?'+query,null,400);});
for(const query of ['keyword[$regex]=.*','keyword=a&keyword=b','keyword='+ 'x'.repeat(101),'category[$ne]=x','price[$gt]=1','price[gte][]=1','price[gte]=1&price[gte]=2','price[gte]=1.001','ratings[gte]=Infinity','ratings[gte]=6']) test('catalog query '+query,async()=>{await env.h.request('GET','/products?'+query,null,null,400);});
for(const [route,query] of [['/admin/users','status=invalid'],['/admin/users','status[]=active'],['/admin/orders','archived=invalid'],['/admin/orders','archived=active&archived=all'],['/admin/orders','status=PAID'],['/orders/me','status=invalid'],['/categories','parent_id[]=null'],['/categories','parent_id=invalid'],['/addresses','page=1'],['/reviews','productId=invalid']]) test(route+' filter '+query,async()=>{await env.request('GET',route+'?'+query,null,400);});
test('substring literal escapado e espaços normalizados sem regex do cliente',async()=>{
    await fixture.Product.create(fixture.productData({name:'Fixture .* (a+)+$ [x]'}));
    await fixture.Product.create(fixture.productData({name:'Outro produto comum'}));
    for(const keyword of ['.*','(a+)+$','[x]','   fixture   ']) {
        const {result}=await env.h.request('GET','/products?keyword='+encodeURIComponent(keyword),null,null,200);
        assert.equal(result.pagination.total,1); assert.equal(result.products.length,1);
    }
});
