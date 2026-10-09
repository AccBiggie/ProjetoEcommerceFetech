const mongoose = require('mongoose');
const { testUri } = require('../replicaSetHarness');
const { shippingInfo } = require('./productHarness');
async function connection() {
    const state = JSON.parse(require('node:fs').readFileSync(require('./e2eContext').context().state, 'utf8'));
    if (!/^fetech_e2e_\d+_\d+$/.test(state.database) || state.uri !== testUri(state.database)) throw new Error('Isolated runner required');
    return mongoose.createConnection(state.uri, { autoCreate: false, autoIndex: false }).asPromise();
}
async function seed() {
    const conn = await connection();
    try {
        const db=conn.db, product=await db.collection('products').findOne({}), user=await db.collection('users').findOne({email:'user@routes.example.com'});
        const products=Array.from({length:30},(_,i)=>({...product,_id:new mongoose.Types.ObjectId(),name:`Paginação fixture ${i}`,description:'Detalhe da fixture',Stock:0,reviews:[],ratings:0,numOfReviews:0,createdAt:new Date(2040,0,i+1)}));
        const users=Array.from({length:30},(_,i)=>({...user,_id:new mongoose.Types.ObjectId(),email:`pagination-e2e-${i}@fixture.invalid`,createdAt:new Date(2040,0,i+1)}));
        const orders=Array.from({length:30},(_,i)=>({_id:new mongoose.Types.ObjectId(),user:user._id,orderItems:[{product:product._id,name:product.name,image:product.images[0].url,priceCents:product.priceCents,quantity:1}],shippingInfo,shippingInfoVersion:2,
            itemsPriceCents:product.priceCents,taxPriceCents:0,shippingPriceCents:0,totalPriceCents:product.priceCents,orderStatus:'Processing',paymentStatus:'PENDING',paymentInfo:{id:'fixture',status:'Pending'},administrativeArchivedAt:null,administrativeArchivedBy:null,createdAt:new Date(2040,0,i+1)}));
        // Historical fixtures have no reservation version marker; no commercial write is performed.
        await db.collection('products').insertMany(products); await db.collection('users').insertMany(users); await db.collection('orders').insertMany(orders);
        return { products:products.map(row=>row._id), users:users.map(row=>row._id), orders:orders.map(row=>row._id) };
    } finally { await conn.close(); }
}
async function cleanup(ids) {
    const conn=await connection();
    try { for(const name of ['products','users','orders']) await conn.db.collection(name).deleteMany({_id:{$in:ids[name]}}); }
    finally { await conn.close(); }
}
module.exports = { seed, cleanup };
