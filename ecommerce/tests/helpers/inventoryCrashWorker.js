const mongoose = require('mongoose');
(async()=>{
    if (!new mongoose.mongo.MongoClient(process.env.DB_URI).options.dbName.startsWith('fetech_routes_auth_')) throw new Error();
    await mongoose.connect(process.env.DB_URI);
    const session=await mongoose.startSession();session.startTransaction();
    const product=new mongoose.Types.ObjectId(process.env.FETECH_FIXTURE_PRODUCT),order=new mongoose.Types.ObjectId();
    await mongoose.connection.collection('products').updateOne({_id:product,Stock:{$gte:1}},{$inc:{Stock:-1}},{session});
    await mongoose.connection.collection('stockmovements').insertOne({order,product,type:'RESERVE',quantity:1,stockBefore:10,stockAfter:9},{session});
    await mongoose.connection.collection('orders').insertOne({_id:order,inventoryStatus:'RESERVED'},{session});
    process.send({ready:true,sessionId:session.id.id.toString('base64')});setInterval(()=>{},1000);
})().catch(()=>{process.send({error:true});process.exit(1);});
