const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary');
const { fixtures, password, productData, categories } = require('./fixtures');
const { withCsrf } = require('./httpHeaders');
const User = require('../backend/models/userModel');
const Product = require('../backend/models/productModel');
const Order = require('../backend/models/orderModel');
const Category = require('../backend/models/categoryModel');
const Address = require('../backend/models/addressModel');
const { migrateLegacyCategories } = require('../backend/utils/categories');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '4000', TRUST_PROXY_HOPS: '0' });

Object.assign(process.env, { AUTH_FORGOT_MIN_RESPONSE_MS: '20', JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRE: '7d', COOKIE_EXPIRE: '7', FRONTEND_URL: 'http://127.0.0.1:3300', PORTEMAIL: '', EMAIL_SECURE: '', HOST: '', USER: '', PASSWORD: '', CLOUDINARY_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
const database = `fetech_routes_${process.pid}_${Date.now()}`;
process.env.DB_URI = `mongodb://127.0.0.1:27017/${database}`;
const runtime = require('../backend/config/runtimeConfig');
runtime.initializeConfig(process.env);
const mails = [];
let transportFailure = false;
nodemailer.createTransport = () => ({ sendMail: async mail => { if (transportFailure) throw new Error('SMTP indisponível'); mails.push(mail); } });
cloudinary.v2.uploader.upload = async () => ({ public_id: 'uploaded-test', secure_url: 'https://example.com/avatar.png' });
const app = require('../backend/app');
let server, base, data, cookies = {};
const missing = '000000000000000000000001';
async function request(method, route, body, role = 'user', expected = 200) {
    const headers = withCsrf(method);
    if (cookies[role]) headers.Cookie = cookies[role];
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, expected, `${method}: status HTTP inesperado`);
    return { result, response };
}
before(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`);
    data = await fixtures();
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    for (const role of Object.keys(data.users)) {
        const { response } = await request('POST', '/login', { email: data.users[role].email, password }, 'anonymous');
        cookies[role] = response.headers.get('set-cookie').split(';')[0];
    }
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

test('catálogo: categorias, busca, preço numérico, paginação e erros de rota', async () => {
    const { result } = await request('GET', '/products', null, 'anonymous');
    assert.equal(result.products.length, 11);
    for (const category of categories) {
        const { result } = await request('GET', '/products?category=' + encodeURIComponent(category));
        assert.equal(result.filteredProductsCount, 1);
        assert.equal(result.products[0].category, category);
    }
    assert.equal((await request('GET', '/products?price[gte]=90&price[lte]=110')).result.products.length, 11);
    assert.equal((await request('GET', '/products?price[gte]=1000')).result.products.length, 0);
    assert.equal((await request('GET', '/products?keyword=Hardware')).result.filteredProductsCount, 1);
    assert.equal((await request('GET', '/products?keyword=%5B')).result.filteredProductsCount, 0);
    await request('GET', '/products?page=-1', null, 'anonymous', 400);
    await request('GET', '/products?page=abc', null, 'anonymous', 400);
    await request('GET', '/products?price[gte]=abc', null, 'anonymous', 400);
    await request('GET', '/product/invalid', null, 'anonymous', 400);
    await request('GET', '/product/' + missing, null, 'anonymous', 404);
    await request('GET', '/inexistente', null, 'anonymous', 404);
    await request('PATCH', '/products', null, 'anonymous', 404);
});

test('conta: cadastro sem foto, avatar opcional, login, perfil e alteração de senha', async () => {
    const registration = await request('POST', '/register', { name: 'Novo cliente', email: 'new@routes.example.com', password, role: 'admin' }, 'anonymous', 201);
    assert.equal(registration.result.user.role, 'user');
    assert.equal(registration.result.user.password, undefined);
    await request('POST', '/register', { name: 'Novo cliente', email: 'new@routes.example.com', password }, 'anonymous', 400);
    await request('POST', '/register', { name: 'Cliente curto', email: 'short@routes.example.com', password: '123' }, 'anonymous', 400);
    await request('POST', '/register', { name: 'Com avatar', email: 'avatar@routes.example.com', password, avatar: 'data:image/png;base64,AAAA' }, 'anonymous', 503);
    Object.assign(process.env, { CLOUDINARY_NAME: 'test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test' });
    runtime.initializeConfig(process.env);
    const avatar = await request('POST', '/register', { name: 'Com avatar', email: 'avatar@routes.example.com', password, avatar: 'data:image/png;base64,AAAA' }, 'anonymous', 201);
    assert.equal(avatar.result.user.avatar.public_id, 'uploaded-test');
    await request('POST', '/login', { email: data.users.user.email, password: 'wrong' }, 'anonymous', 401);
    await request('POST', '/login', {}, 'anonymous', 400);
    await request('GET', '/me', null, 'anonymous', 401);
    cookies.expired = 'token=' + jwt.sign({ id: data.users.user.id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
    cookies.invalid = 'token=invalid';
    await request('GET', '/me', null, 'expired', 401);
    await request('GET', '/me', null, 'invalid', 401);
    assert.equal((await request('GET', '/me')).result.user._id, data.users.user.id);
    const form = new FormData(); form.set('name', 'Cliente atualizado'); form.set('email', data.users.user.email); form.set('role', 'admin'); form.set('avatar', 'data:image/png;base64,AAAA');
    const profile = (await request('PUT', '/me/update', form)).result.user;
    assert.equal(profile.name, 'Cliente atualizado'); assert.equal(profile.role, 'user'); assert.equal(profile.avatar.public_id, 'uploaded-test');
    await request('PUT', '/password/update', { oldPassword: 'wrong', newPassword: 'NovaSenha123!', confirmPassword: 'NovaSenha123!' }, 'user', 400);
    await request('PUT', '/password/update', { oldPassword: password, newPassword: 'NovaSenha123!', confirmPassword: 'different' }, 'user', 400);
    const changed = await request('PUT', '/password/update', { oldPassword: password, newPassword: 'NovaSenha123!', confirmPassword: 'NovaSenha123!' });
    await request('GET', '/me', null, 'user', 401);
    cookies.user = changed.response.headers.get('set-cookie').split(';')[0];
    await request('POST', '/login', { email: data.users.user.email, password }, 'anonymous', 401);
    await request('POST', '/login', { email: data.users.user.email.toUpperCase(), password: 'NovaSenha123!' }, 'anonymous');
});

test('recuperação: contrato genérico, token, expiração e limpeza em falha SMTP', async () => {
    await request('POST', '/password/forgot', { email: 'missing@routes.example.com' }, 'anonymous', 200);
    await request('POST', '/password/forgot', { email: data.users.other.email }, 'anonymous', 200);
    assert.equal((await User.findById(data.users.other._id)).resetPasswordToken, undefined);
    Object.assign(process.env, { HOST: 'smtp.test', USER: 'test', PASSWORD: 'test', PORTEMAIL: '587' });
    runtime.initializeConfig(process.env);
    await request('POST', '/password/forgot', { email: data.users.other.email }, 'anonymous');
    const token = mails.at(-1).text.match(/password\/reset\/([a-f0-9]+)/)[1];
    await request('PUT', '/password/reset/invalid', { password, confirmPassword: password }, 'anonymous', 400);
    await request('PUT', '/password/reset/' + token, { password, confirmPassword: 'different' }, 'anonymous', 400);
    const reset = await request('PUT', '/password/reset/' + token, { password: 'ResetSenha123!', confirmPassword: 'ResetSenha123!' }, 'anonymous');
    await request('GET', '/me', null, 'other', 401);
    cookies.other = reset.response.headers.get('set-cookie').split(';')[0];
    assert.equal(reset.result.user.resetPasswordToken, undefined);
    await request('PUT', '/password/reset/' + token, { password, confirmPassword: password }, 'anonymous', 400);
    await request('POST', '/login', { email: data.users.other.email, password: 'ResetSenha123!' }, 'anonymous');
    const user = await User.findById(data.users.other._id); const expiredToken = user.getResetPasswordToken(); user.resetPasswordExpire = Date.now() - 1000; await user.save();
    await request('PUT', '/password/reset/' + expiredToken, { password, confirmPassword: password }, 'anonymous', 400);
    transportFailure = true;
    await request('POST', '/password/forgot', { email: data.users.other.email }, 'anonymous', 200);
    assert.equal((await User.findById(data.users.other._id)).resetPasswordToken, undefined);
    transportFailure = false;
});

test('produtos e usuários: operações administrativas, validação e permissões', async () => {
    for (const route of ['/admin/products', '/admin/users', '/admin/orders']) {
        await request('GET', route, null, 'anonymous', 401);
        await request('GET', route, null, 'user', 403);
        await request('GET', route, null, 'admin');
    }
    await request('POST', '/product/new', productData(), 'user', 403);
    await request('POST', '/product/new', productData({ price: 'invalid' }), 'admin', 400);
    const product = (await request('POST', '/product/new', productData(), 'admin', 201)).result.product;
    await request('PUT', '/product/' + product._id, { price: '125.00' }, 'admin');
    assert.equal((await request('GET', '/product/' + product._id)).result.product.price, '125.00');
    await request('PUT', '/product/' + missing, { name: 'Missing' }, 'admin', 404);
    await request('PUT', '/product/' + product._id, { Stock: -1 }, 'admin', 400);
    await request('DELETE', '/product/' + product._id, null, 'admin');
    await request('DELETE', '/product/' + product._id, null, 'admin', 404);
    await request('GET', '/admin/user/' + data.users.other.id, null, 'admin');
    await request('GET', '/admin/user/' + missing, null, 'admin', 404);
    await request('PUT', '/admin/user/' + missing, { role: 'admin' }, 'admin', 404);
    await request('PUT', '/admin/user/' + data.users.other.id, { role: 'invalid' }, 'admin', 400);
    await request('PUT', '/admin/user/' + data.users.other.id, { role: 'admin' }, 'admin');
    assert.equal((await User.findById(data.users.other.id)).role, 'admin');
    await request('PUT', '/admin/user/' + data.users.other.id, { role: 'user' }, 'admin');
    await request('DELETE', '/admin/user/' + missing, null, 'admin', 404);
});

test('avaliações: criar, atualizar, listar, remover e recalcular média', async () => {
    const id = data.products[0].id;
    await request('PUT', '/review', { productId: id, rating: 0, comment: 'Invalid' }, 'user', 400);
    await request('PUT', '/review', { productId: missing, rating: 5, comment: 'Good' }, 'user', 404);
    await request('PUT', '/review', { productId: id, rating: 5, comment: 'Good' });
    await request('PUT', '/review', { productId: id, rating: 4, comment: 'Updated' });
    await request('PUT', '/review', { productId: id, rating: 2, comment: 'Other' }, 'other');
    const { result } = await request('GET', '/reviews?id=' + id);
    assert.equal(result.reviews.length, 2);
    assert.equal((await Product.findById(id)).ratings, 3);
    const review = result.reviews.find(review => review.user === data.users.user.id);
    const route = `/reviews?productId=${id}&id=${review._id}`;
    await request('DELETE', route, null, 'anonymous', 401);
    await request('DELETE', route, null, 'other', 403);
    await request('DELETE', route);
    const remaining = (await request('GET', '/reviews?productId=' + id)).result.reviews[0];
    await request('DELETE', `/reviews?productId=${id}&id=${remaining._id}`, null, 'admin');
    const product = await Product.findById(id); assert.equal(product.ratings, 0); assert.equal(product.numOfReviews, 0);
    await request('GET', '/reviews?id=' + missing, null, 'anonymous', 404);
    await request('DELETE', `/reviews?productId=${id}&id=${missing}`, null, 'admin', 404);
});

test('pedidos: checkout, preços do servidor, propriedade, status e estoque', async () => {
    const product = data.products[1];
    const payload = { shippingInfo: { recipientName: 'Cliente Fixture', number: '1', complement: '', neighborhood: 'Centro', address: 'Rua Teste, 1', city: 'Maringá', state: 'PR', country: 'Brasil', pinCode: '87000000', phoneNo: '44999999999' }, orderItems: [{ product: product.id, quantity: 2, price: 1 }], totalPrice: 1, paymentInfo: { id: 'forged', status: 'succeeded' } };
    await request('POST', '/order/new', payload, 'anonymous', 401);
    await request('POST', '/order/new', { ...payload, orderItems: [] }, 'user', 400);
    await request('POST', '/order/new', { ...payload, orderItems: [{ product: product.id, quantity: 999 }] }, 'user', 400);
    await request('POST', '/order/new', { ...payload, orderItems: [{ product: missing, quantity: 1 }] }, 'user', 404);
    const order = (await request('POST', '/order/new', payload, 'user', 201)).result.order;
    assert.equal(order.totalPriceCents, 20000); assert.equal(order.totalPrice, "200.00"); assert.equal(order.paymentInfo.status, 'Pending'); assert.equal(order.paidAt, undefined);
    const route = '/order/' + order._id;
    await request('GET', route); await request('GET', route, null, 'admin'); await request('GET', route, null, 'other', 403);
    assert.equal((await request('GET', '/orders/me')).result.orders.length, 1);
    await request('GET', '/order/' + missing, null, 'user', 404);
    await request('GET', '/order/invalid', null, 'user', 400);
    await request('PUT', '/admin/order/' + order._id, { status: 'Shipped' }, 'user', 403);
    await request('PUT', '/admin/order/' + order._id, { status: 'Delivered' }, 'admin', 400);
    await request('PUT', '/admin/order/' + order._id, { status: 'invalid' }, 'admin', 400);
    await request('PUT', '/admin/order/' + order._id, { status: 'Shipped' }, 'admin');
    assert.equal((await Product.findById(product.id)).Stock, 18);
    await request('PUT', '/admin/order/' + order._id, { status: 'Shipped' }, 'admin', 400);
    await request('PUT', '/admin/order/' + order._id, { status: 'Delivered' }, 'admin');
    assert.equal((await Product.findById(product.id)).Stock, 18);
    assert.ok((await Order.findById(order._id)).deliveredAt);
    await request('PUT', '/admin/order/' + missing, { status: 'Shipped' }, 'admin', 404);
    await request('DELETE', '/admin/order/' + order._id, null, 'admin');
    await request('DELETE', '/admin/order/' + order._id, null, 'admin', 404);
});

test('logout e conta removida não deixam sessões utilizáveis', async () => {
    const logout = await request('POST', '/logout'); assert.equal(logout.result.success, true);
    assert.match(logout.response.headers.get('set-cookie'), /Expires=/i);
    await request('GET', '/me', null, 'user', 401);
    const login = await request('POST', '/login', { email: data.users.user.email, password: 'NovaSenha123!' }, 'anonymous');
    cookies.user = login.response.headers.get('set-cookie').split(';')[0];
    const id = data.users.other.id;
    await request('DELETE', '/admin/user/' + id, null, 'admin');
    await request('GET', '/me', null, 'other', 401);
});

test('envio com falha de estoque restaura os itens anteriores e mantém o pedido', async () => {
    const [first, second] = data.products.slice(3, 5);
    const shippingInfo = { recipientName: 'Cliente Fixture', number: '1', complement: '', neighborhood: 'Centro', address: 'Rua Teste', city: 'Maringá', state: 'PR', country: 'Brasil', pinCode: '87000000', phoneNo: '44999999999' };
    const order = (await request('POST', '/order/new', { shippingInfo, orderItems: [{ product: first.id, quantity: 2 }, { product: second.id, quantity: 1 }] }, 'user', 201)).result.order;
    await Product.updateOne({ _id: second.id }, { Stock: 0 });
    await request('PUT', '/admin/order/' + order._id, { status: 'Shipped' }, 'admin', 400);
    assert.equal((await Product.findById(first.id)).Stock, 20);
    assert.equal((await Order.findById(order._id)).orderStatus, 'Processing');
    await Product.updateOne({ _id: second.id }, { Stock: 20 });
    await request('PUT', '/admin/order/' + order._id, { status: 'Shipped' }, 'admin');
    assert.equal((await Product.findById(first.id)).Stock, 18);
    assert.equal((await Product.findById(second.id)).Stock, 19);
});

test('categorias: CRUD separado, permissões, parent_id, ciclos e produtos vinculados', async () => {
    assert.equal((await request('GET', '/categories', null, 'anonymous')).result.categories.length, 11);
    await request('GET', '/admin/categories', null, 'anonymous', 401);
    await request('GET', '/admin/categories', null, 'user', 403);
    await request('POST', '/admin/category', { name: 'Negada' }, 'anonymous', 401);
    await request('POST', '/admin/category', { name: 'Negada' }, 'user', 403);
    for (const name of ['', '   ', 42, 'x'.repeat(81)]) await request('POST', '/admin/category', { name }, 'admin', 400);
    await request('POST', '/admin/category', { name: 'Pai inválido', parent_id: 'invalid' }, 'admin', 400);
    await request('POST', '/admin/category', { name: 'Pai ausente', parent_id: missing }, 'admin', 400);
    const parent = (await request('POST', '/admin/category', { name: '  Componentes   novos  ' }, 'admin', 201)).result.category;
    assert.equal(parent.name, 'Componentes novos'); assert.equal(parent.parent_id, null);
    assert.equal(parent.name_key, undefined);
    await request('POST', '/admin/category', { name: 'COMPONENTES NOVOS' }, 'admin', 400);
    const child = (await request('POST', '/admin/category', { name: 'Placas novas', parent_id: parent._id }, 'admin', 201)).result.category;
    assert.equal(child.parent_id, parent._id);
    const leaf = (await request('POST', '/admin/category', { name: 'Placas especiais', parent_id: child._id }, 'admin', 201)).result.category;
    assert.equal((await request('GET', '/category/' + child._id, null, 'anonymous')).result.category.parent_id, parent._id);
    assert.equal((await request('GET', '/categories?parent_id=' + parent._id)).result.categories[0]._id, child._id);
    assert.ok((await request('GET', '/categories?parent_id=null')).result.categories.every(category => category.parent_id === null));
    await request('GET', '/categories?parent_id=invalid', null, 'anonymous', 400);
    await request('GET', '/category/invalid', null, 'anonymous', 400);
    await request('GET', '/category/' + missing, null, 'anonymous', 404);
    for (const method of ['PUT', 'DELETE']) {
        await request(method, '/admin/category/' + parent._id, { name: 'Negada' }, 'anonymous', 401);
        await request(method, '/admin/category/' + parent._id, { name: 'Negada' }, 'user', 403);
        await request(method, '/admin/category/' + missing, { name: 'Ausente' }, 'admin', 404);
    }
    await request('PUT', '/admin/category/' + parent._id, { parent_id: parent._id }, 'admin', 400);
    await request('PUT', '/admin/category/' + parent._id, { parent_id: leaf._id }, 'admin', 400);
    await request('PUT', '/admin/category/' + child._id, { name: 'Hardware' }, 'admin', 400);
    await request('DELETE', '/admin/category/' + parent._id, null, 'admin', 409);
    await request('POST', '/product/new', productData({ category_id: missing }), 'admin', 400);
    await request('POST', '/product/new', productData({ category_id: 'invalid' }), 'admin', 400);
    await request('POST', '/product/new', productData({ category: 'Não cadastrada' }), 'admin', 400);
    const product = (await request('POST', '/product/new', productData({ category: undefined, category_id: leaf._id }), 'admin', 201)).result.product;
    assert.equal(product.category, leaf.name); assert.equal(product.category_id, leaf._id);
    assert.equal((await request('GET', '/products?category=' + parent._id)).result.products[0]._id, product._id);
    assert.equal((await request('GET', '/products?category=' + encodeURIComponent(parent.name))).result.filteredProductsCount, 1);
    await request('PUT', '/admin/category/' + leaf._id, { name: 'Placas renomeadas' }, 'admin');
    assert.equal((await request('GET', '/product/' + product._id)).result.product.category, 'Placas renomeadas');
    await request('DELETE', '/admin/category/' + leaf._id, null, 'admin', 409);
    await request('PUT', '/admin/category/' + leaf._id, { parent_id: null }, 'admin');
    assert.equal((await request('GET', '/products?category=' + parent._id)).result.filteredProductsCount, 0);
    await request('PUT', '/product/' + product._id, { category_id: child._id }, 'admin');
    assert.equal((await request('GET', '/product/' + product._id)).result.product.category, child.name);
    await request('DELETE', '/admin/category/' + leaf._id, null, 'admin');
    await request('DELETE', '/product/' + product._id, null, 'admin');
    await request('DELETE', '/admin/category/' + child._id, null, 'admin');
    await request('DELETE', '/admin/category/' + parent._id, null, 'admin');
});

test('categorias: migração preserva produtos antigos, é repetível e não recria registros excluídos', async () => {
    const legacy = await Product.create(productData({ category: 'Categoria legada', user: data.users.admin._id }));
    await migrateLegacyCategories();
    const migrated = await Product.findById(legacy._id);
    const category = await Category.findById(migrated.category_id);
    assert.equal(category.name, 'Categoria legada'); assert.equal(category.parent_id, null);
    assert.equal(migrated.price, legacy.price); assert.equal(migrated.Stock, legacy.Stock);
    const count = await Category.countDocuments();
    await migrateLegacyCategories();
    assert.equal(await Category.countDocuments(), count);
    assert.equal(String((await Product.findById(legacy._id)).category_id), String(category._id));
    await legacy.deleteOne(); await category.deleteOne();
    await migrateLegacyCategories();
    assert.equal(await Category.exists({ name: 'Categoria legada' }), null);
});

const addressData = overrides => ({
    label: 'Casa', recipientName: 'Cliente Endereços', address: 'Rua das Flores', number: '10',
    complement: '', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', country: 'Brasil',
    pinCode: '01234-567', phoneNo: '(011) 99999-9999', ...overrides,
});

test('endereços: múltiplos registros, CRUD privado, dados string e proprietário da sessão', async () => {
    const accounts = {};
    for (const role of ['addressOwner', 'addressOther']) {
        const registration = await request('POST', '/register', { name: 'Cliente ' + role, email: `${role.toLowerCase()}@routes.example.com`, password }, 'anonymous', 201);
        accounts[role] = registration.result.user;
        cookies[role] = registration.response.headers.get('set-cookie').split(';')[0];
    }
    await request('GET', '/addresses', null, 'anonymous', 401);
    await request('POST', '/address/new', addressData(), 'anonymous', 401);
    assert.equal((await request('GET', '/addresses', null, 'addressOwner')).result.addresses.length, 0);
    const first = (await request('POST', '/address/new', addressData({ user: accounts.addressOther._id, userId: accounts.addressOther._id, role: 'admin' }), 'addressOwner', 201)).result.address;
    assert.equal(first.user, accounts.addressOwner._id);
    assert.equal(first.pinCode, '01234567'); assert.equal(typeof first.pinCode, 'string');
    assert.equal(first.phoneNo, '011999999999'); assert.equal(typeof first.phoneNo, 'string');
    assert.equal(first.favorite, false); assert.ok(first.createdAt); assert.ok(first.updatedAt);
    const second = (await request('POST', '/address/new', addressData({ label: 'Trabalho', country: undefined, favorite: true }), 'addressOwner', 201)).result.address;
    assert.equal(second.country, 'Brasil');
    const foreign = (await request('POST', '/address/new', addressData({ label: 'Outro usuário', favorite: true }), 'addressOther', 201)).result.address;
    const list = (await request('GET', '/addresses?user=' + accounts.addressOther._id, null, 'addressOwner')).result.addresses;
    assert.equal(list.length, 2); assert.equal(list[0]._id, second._id);
    assert.ok(list.every(address => address.user === accounts.addressOwner._id));
    assert.equal((await request('GET', '/addresses', null, 'addressOther')).result.addresses.length, 1);
    for (const [method, suffix] of [['GET', ''], ['PUT', ''], ['DELETE', ''], ['PUT', '/favorite']]) {
        await request(method, '/address/' + first._id + suffix, method === 'PUT' ? addressData() : null, 'anonymous', 401);
        await request(method, '/address/' + first._id + suffix, method === 'PUT' ? addressData() : null, 'addressOther', 404);
        await request(method, '/address/' + first._id + suffix, method === 'PUT' ? addressData() : null, 'admin', 404);
        await request(method, '/address/invalid' + suffix, method === 'PUT' ? {} : null, 'addressOwner', 400);
        await request(method, '/address/' + missing + suffix, method === 'PUT' ? {} : null, 'addressOwner', 404);
    }
    const updated = (await request('PUT', '/address/' + first._id, { label: 'Apartamento', number: '20A', complement: 'Fundos', user: accounts.addressOther._id, userId: accounts.addressOther._id, favorite: true }, 'addressOwner')).result.address;
    assert.equal(updated.label, 'Apartamento'); assert.equal(updated.number, '20A'); assert.equal(updated.complement, 'Fundos');
    assert.equal(updated.user, accounts.addressOwner._id);
    let own = (await request('GET', '/addresses', null, 'addressOwner')).result.addresses;
    assert.equal(own.filter(address => address.favorite).length, 1); assert.equal(own[0]._id, first._id);
    assert.equal((await request('GET', '/address/' + second._id, null, 'addressOwner')).result.address.favorite, false);
    await request('PUT', '/address/' + second._id + '/favorite', null, 'addressOwner');
    await request('PUT', '/address/' + second._id + '/favorite', null, 'addressOwner');
    own = (await request('GET', '/addresses', null, 'addressOwner')).result.addresses;
    assert.equal(own[0]._id, second._id); assert.equal(own.filter(address => address.favorite).length, 1);
    const third = (await request('POST', '/address/new', addressData({ label: 'Outra casa', favorite: true }), 'addressOwner', 201)).result.address;
    assert.equal((await request('GET', '/address/' + second._id, null, 'addressOwner')).result.address.favorite, false);
    await request('PUT', '/address/' + third._id, { favorite: false }, 'addressOwner');
    assert.equal((await request('GET', '/addresses', null, 'addressOwner')).result.addresses.filter(address => address.favorite).length, 0);
    await request('PUT', '/address/' + third._id + '/favorite', null, 'addressOwner');
    await request('DELETE', '/address/' + third._id, null, 'addressOwner');
    assert.equal((await request('GET', '/addresses', null, 'addressOwner')).result.addresses.filter(address => address.favorite).length, 0);
    assert.equal((await request('GET', '/address/' + foreign._id, null, 'addressOther')).result.address.favorite, true);
    await request('DELETE', '/address/' + first._id, null, 'addressOwner');
    await request('DELETE', '/address/' + second._id, null, 'addressOwner');
    await request('GET', '/address/' + first._id, null, 'addressOwner', 404);
    await request('DELETE', '/address/' + foreign._id, null, 'addressOther');
});

test('endereços: validação não remove favorito e índice protege alterações concorrentes', async () => {
    const first = (await request('POST', '/address/new', addressData({ favorite: true }), 'addressOwner', 201)).result.address;
    for (const field of ['label', 'recipientName', 'address', 'number', 'neighborhood', 'city', 'state', 'country', 'pinCode', 'phoneNo']) {
        await request('POST', '/address/new', addressData({ [field]: '   ', favorite: true }), 'addressOwner', 400);
    }
    for (const invalid of [{ pinCode: 1234567 }, { phoneNo: 11999999999 }, { pinCode: '123' }, { pinCode: '01234567a' }, { phoneNo: '123' }, { phoneNo: '011999999999x' }, { favorite: 'true' }, { label: ['Casa'] }, { label: 'x'.repeat(81) }]) {
        await request('POST', '/address/new', addressData({ ...invalid, favorite: true, ...(invalid.favorite !== undefined ? { favorite: invalid.favorite } : {}) }), 'addressOwner', 400);
        await request('PUT', '/address/' + first._id, invalid, 'addressOwner', 400);
    }
    assert.equal((await request('GET', '/address/' + first._id, null, 'addressOwner')).result.address.favorite, true);
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request('POST', '/address/new', addressData({ label: `Concorrente ${i}`, favorite: true }), 'addressOwner', 201)));
    let list = (await request('GET', '/addresses', null, 'addressOwner')).result.addresses;
    assert.equal(list.filter(address => address.favorite).length, 1);
    await Promise.all(results.map(({ result }) => request('PUT', '/address/' + result.address._id + '/favorite', null, 'addressOwner')));
    list = (await request('GET', '/addresses', null, 'addressOwner')).result.addresses;
    assert.equal(list.filter(address => address.favorite).length, 1);
    await assert.rejects(Address.create({ ...addressData({ pinCode: '01234567', phoneNo: '011999999999', favorite: true }), user: first.user }), error => error.code === 11000);
    for (const address of list) await request('DELETE', '/address/' + address._id, null, 'addressOwner');
});

test('endereços: editar e excluir cadastro não altera snapshot de pedidos', async () => {
    const shippingInfo = { recipientName: 'Cliente Fixture', number: '1', complement: '', neighborhood: 'Centro', address: 'Rua Histórica, 100', city: 'São Paulo', state: 'SP', country: 'Brasil', pinCode: '01234567', phoneNo: '011999999999' };
    const order = (await request('POST', '/order/new', { shippingInfo, orderItems: [{ product: data.products[0].id, quantity: 1 }] }, 'addressOwner', 201)).result.order;
    const address = (await request('POST', '/address/new', addressData(), 'addressOwner', 201)).result.address;
    await request('PUT', '/address/' + address._id, { address: 'Rua alterada', pinCode: '00000001' }, 'addressOwner');
    await request('DELETE', '/address/' + address._id, null, 'addressOwner');
    assert.deepEqual((await request('GET', '/order/' + order._id, null, 'addressOwner')).result.order.shippingInfo, shippingInfo);
    await request('DELETE', '/admin/order/' + order._id, null, 'admin');
});
