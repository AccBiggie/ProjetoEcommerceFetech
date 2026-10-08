const User = require('../backend/models/userModel');
const Product = require('../backend/models/productModel');
const Category = require('../backend/models/categoryModel');
const Address = require('../backend/models/addressModel');
const { categoryKey } = require('../backend/utils/categories');
const categories = require('../frontend/src/data/categories.json');

const password = 'RouteTest123!';
const productData = (overrides = {}) => ({
    name: 'Produto de teste de rotas', description: 'Produto temporário para testes.', category: 'Hardware',
    price: '100.00', oldPrice: '120.00', installmmentPrice: '8.33', off: 17,
    countDown: new Date(Date.now() + 86400000).toISOString(), Stock: 20,
    images: [{ public_id: 'test-image', url: '/demo-products/R5.png', banner: '/demo-products/R5.png' }], ...overrides,
});
async function fixtures() {
    const users = {};
    for (const role of ['admin', 'user', 'other']) users[role] = await User.create({
        name: `Teste ${role}`, email: `${role}@routes.example.com`, password, role: role === 'admin' ? 'admin' : 'user',
        avatar: { public_id: 'test-avatar', url: '/Profile.png' },
    });
    const products = [];
    await Category.init();
    await Address.init();
    await require('../backend/models/orderModel').init();
    await require('../backend/models/orderIdempotencyModel').init();
    await require('../backend/models/stockMovementModel').init();
    for (const category of categories) {
        const record = await Category.create({ name: category, name_key: categoryKey(category) });
        products.push(await Product.create(productData({ name: `Produto ${category}`, category, category_id: record._id, user: users.admin._id })));
    }
    return { users, products };
}
module.exports = { fixtures, password, productData, categories };
