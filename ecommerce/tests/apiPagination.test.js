const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/paginationFixture');
const mongoose = require('mongoose');
let env;
before(async () => { env = await fixture.start(); });
after(async () => { if (env) await env.stop(); });
const routes = [
    ['/products', 'products', null, 12, 56], ['/admin/products', 'products', 'cookie', 25, 56],
    ['/admin/users', 'users', 'cookie', 25, 56], ['/admin/orders', 'orders', 'cookie', 25, 56],
    ['/orders/me', 'orders', 'userCookie', 25, 56],
];
for (const [route, key, auth, defaultLimit, total] of routes) {
    test(`${route}: default e metadados`, async () => {
        const { result } = await env.h.request('GET', route, null, env[auth], 200);
        assert.equal(result[key].length, defaultLimit);
        assert.deepEqual(result.pagination, { page: 1, limit: defaultLimit, total, pages: Math.ceil(total/defaultLimit), hasNext: true, hasPrevious: false });
    });
    test(`${route}: páginas estáveis, limite, vazio e última página`, async () => {
        const get = async query => (await env.h.request('GET', route + query, null, env[auth], 200)).result;
        const first = await get('?limit=5'), second = await get('?page=2&limit=5'), repeat = await get('?page=2&limit=5');
        assert.equal(second[key].length, 5); assert.equal(second.pagination.total, total);
        assert.deepEqual(second[key], repeat[key]);
        assert.equal(new Set([...first[key], ...second[key]].map(row => row._id)).size, 10);
        assert.equal((await get('?page=12&limit=5'))[key].length, 1);
        assert.deepEqual((await get('?page=99&limit=5'))[key], []);
        assert.equal((await get('?limit=100'))[key].length, total);
    });
    test(`${route}: número de consultas constante entre 5 e 50`, async () => {
        const count = async limit => {
            let queries = 0; mongoose.set('debug', () => queries++);
            try { await env.h.request('GET', route + '?limit=' + limit, null, env[auth], 200); return queries; }
            finally { mongoose.set('debug', false); }
        };
        assert.equal(await count(5), await count(50));
    });
}
test('projeções removem arrays e segredos; detalhes preservam descrição e snapshot', async () => {
    const products = (await env.request('GET','/admin/products?limit=5',null,200)).result.products;
    for (const row of products) { assert.equal(row.description,undefined); assert.equal(row.reviews,undefined); assert.equal(row.user,undefined); assert.ok(row.images.length <= 1); assert.ok(Number.isSafeInteger(row.priceCents)); }
    const users = (await env.request('GET','/admin/users?limit=5',null,200)).result.users;
    for (const row of users) for (const key of ['password','resetPasswordToken','resetPasswordExpire','tokenVersion','avatarRevision','adminMutationFence']) assert.equal(row[key],undefined);
    const orders = (await env.request('GET','/admin/orders?limit=5',null,200)).result;
    assert.equal(orders.totalAmountCents,56*10000);
    for (const row of orders.orders) for (const key of ['shippingInfo','orderItems','idempotencyKeyHash','idempotencyRequestHash']) assert.equal(row[key],undefined);
    const detail = (await env.request('GET','/order/'+orders.orders[0]._id,null,200)).result.order;
    assert.ok(detail.shippingInfo); assert.ok(detail.orderItems.length); assert.ok(detail.paymentInfo);
    const product = (await env.h.request('GET','/product/'+env.product._id,null,null,200)).result.product;
    assert.ok(product.description.length > 10000); assert.ok(Array.isArray(product.reviews));
});
test('filtros de lifecycle e isolamento do cliente preservados', async () => {
    await mongoose.models.User.collection.updateOne({email:'fixture0@pagination.invalid'},{$set:{accountStatus:'DEACTIVATED',deactivatedAt:new Date(),deactivatedBy:env.admin._id}});
    await mongoose.models.User.collection.updateOne({email:'fixture1@pagination.invalid'},{$unset:{accountStatus:''}});
    assert.equal((await env.request('GET','/admin/users?status=deactivated',null,200)).result.pagination.total,1);
    assert.equal((await env.request('GET','/admin/users?status=active',null,200)).result.pagination.total,55);
    assert.equal((await env.request('GET','/admin/users?status=all',null,200)).result.pagination.total,56);
    const order = await fixture.Order.findOne().lean();
    await fixture.Order.collection.updateOne({_id:order._id},{$set:{administrativeArchivedAt:new Date(),administrativeArchivedBy:env.admin._id}});
    assert.equal((await env.request('GET','/admin/orders?archived=active',null,200)).result.pagination.total,55);
    assert.equal((await env.request('GET','/admin/orders?archived=archived',null,200)).result.pagination.total,1);
    assert.equal((await env.h.request('GET','/orders/me',null,env.userCookie,200)).result.pagination.total,56);
    const other = await env.h.createUser(); const cookie = await env.h.login(other);
    assert.equal((await env.h.request('GET','/orders/me',null,cookie,200)).result.pagination.total,0);
});
test('reviews: slice limitado no Mongo, metadados e detalhe intacto', async () => {
    const users = await mongoose.models.User.find().limit(30).lean();
    const reviews = users.map(user=>({_id:new mongoose.Types.ObjectId(),user:user._id,name:user.name,rating:5,comment:'Avaliação fixture'}));
    await fixture.Product.collection.updateOne({_id:env.product._id},{$set:{reviews,numOfReviews:30,ratings:5}});
    const reply = await env.h.request('GET',`/reviews?productId=${env.product._id}&limit=5&page=2`,null,null,200);
    assert.equal(reply.result.reviews.length,5); assert.equal(reply.result.pagination.total,30);
    assert.deepEqual(reply.result.reviews.map(row=>row._id),reviews.slice(5,10).map(row=>String(row._id)));
    assert.equal((await env.h.request('GET','/product/'+env.product._id,null,null,200)).result.product.reviews.length,30);
});
test('categories: árvore integral abaixo do teto e overflow explícito', async () => {
    const reply = await env.h.request('GET','/categories',null,null,200);
    assert.equal(reply.result.categories.length,1);
    const entries = Array.from({length:1000},(_,i)=>({_id:new mongoose.Types.ObjectId(),name:'Categoria '+i,name_key:'categoria '+i,parent_id:env.category._id,createdAt:new Date()}));
    await fixture.Category.collection.insertMany(entries);
    try {
        const overflow=await env.h.request('GET','/categories',null,null,503); assert.equal(overflow.result.code,'REFERENCE_SET_TOO_LARGE');
        assert.equal((await env.h.request('GET','/categories?parent_id='+env.category._id,null,null,200)).result.categories.length,1000);
    } finally { await fixture.Category.collection.deleteMany({_id:{$in:entries.map(row=>row._id)}}); }
});
test('addresses: somente proprietário, favorito primeiro e overflow explícito', async () => {
    const Address=mongoose.models.Address;
    const rows=Array.from({length:101},(_,i)=>({_id:new mongoose.Types.ObjectId(),user:env.user._id,label:'Fixture '+i,...fixture.shippingInfo,favorite:i===0,createdAt:new Date()}));
    await Address.collection.insertMany(rows);
    try {
        assert.equal((await env.h.request('GET','/addresses',null,env.userCookie,503)).result.code,'REFERENCE_SET_TOO_LARGE');
        await Address.collection.deleteOne({_id:rows.at(-1)._id});
        const result=(await env.h.request('GET','/addresses',null,env.userCookie,200)).result;
        assert.equal(result.addresses.length,100); assert.equal(result.addresses[0].favorite,true);
        assert.equal((await env.request('GET','/addresses',null,200)).result.addresses.length,0);
    } finally { await Address.collection.deleteMany({user:env.user._id}); }
});
test('totalAmount global rejeita centavos inválidos fora da página',async()=>{
    const order=await fixture.Order.findOne().sort({createdAt:1,_id:1}).lean();
    for(const totalPriceCents of [-1,1.5,'invalid',Number.MAX_SAFE_INTEGER+1]) {
        await fixture.Order.collection.updateOne({_id:order._id},{$set:{totalPriceCents}});
        await env.request('GET','/admin/orders?archived=all&limit=1',null,400);
    }
    await fixture.Order.collection.updateOne({_id:order._id},{$set:{totalPriceCents:order.totalPriceCents}});
});
