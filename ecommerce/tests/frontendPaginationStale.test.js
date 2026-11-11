const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
async function actionHarness() {
    const requests=[], dispatches=[];
    const axios={isCancel:()=>false,get(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));}};
    const key='__paginationAxios'+require('node:crypto').randomBytes(6).toString('hex');globalThis[key]=axios;
    const source=fs.readFileSync(require('node:path').resolve(__dirname,'../frontend/src/actions/productAction.js'),'utf8').replace(/import[\s\S]*?from\s+["'][^"']+["'];/g,'');
    const constants=['ALL_PRODUCT_FAIL','ALL_PRODUCT_REQUEST','ALL_PRODUCT_SUCCESS','PRODUCT_DETAILS_FAIL','PRODUCT_DETAILS_REQUEST','PRODUCT_DETAILS_SUCCESS','CLEAR_ERRORS'];
    const helper=require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../frontend/src/utils/latestRead.mjs')).href;
    const prefix=`import { latestRead } from '${helper}'; const axios=globalThis.${key}; const getErrorMessage=e=>e.message; const ${constants.map(name=>`${name}='${name}'`).join(',')};\n`;
    const module=await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
    delete globalThis[key];
    return {getProduct:module.getProduct,getProductDetails:module.getProductDetails,requests,dispatches,dispatch:event=>dispatches.push(event)};
}
for(const fails of [false,true]) test('catálogo ignora '+(fails?'erro':'sucesso')+' antigo mesmo quando transporte ignora abort',async()=>{
    const h=await actionHarness();
    const old=h.getProduct('old',1)(h.dispatch);
    await Promise.resolve(); // Ensure the old transport started before switching keys.
    const current=h.getProduct('current',2)(h.dispatch);
    await Promise.resolve();
    assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[1].resolve({data:{products:[{name:'Atual'}],pagination:{page:2}}});await current;
    if(fails) h.requests[0].reject(Error('Erro antigo'));else h.requests[0].resolve({data:{products:[{name:'Antigo'}]}});
    await old;
    const complete=h.dispatches.filter(event=>event.type!=='ALL_PRODUCT_REQUEST');
    assert.equal(complete.length,1); assert.equal(complete[0].type,'ALL_PRODUCT_SUCCESS');assert.equal(complete[0].payload.products[0].name,'Atual');
});
for(const detail of [false,true]) test('leituras reais '+(detail?'detalhe':'catálogo')+' deduplicam replay pendente e permitem refetch após conclusão',async()=>{
    const h=await actionHarness(); const read=()=>detail?h.getProductDetails('product')(h.dispatch):h.getProduct('',1)(h.dispatch);
    const first=read(), replay=read(); await Promise.resolve();
    assert.equal(first,replay);assert.equal(h.requests.length,1);
    h.requests[0].resolve({data:{products:[],product:{_id:'product'}}});await first;
    const refetch=read();await Promise.resolve();assert.equal(h.requests.length,2);
    h.requests[1].resolve({data:{products:[],product:{_id:'product'}}});await refetch;
});
for(const fails of [false,true]) test('detalhe ignora '+(fails?'erro':'sucesso')+' antigo quando transporte ignora abort',async()=>{
    const h=await actionHarness();const old=h.getProductDetails('old')(h.dispatch);await Promise.resolve();
    const current=h.getProductDetails('new')(h.dispatch);await Promise.resolve();
    assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[1].resolve({data:{product:{_id:'new'}}});await current;
    if(fails) h.requests[0].reject(Error('old'));else h.requests[0].resolve({data:{product:{_id:'old'}}});await old;
    const complete=h.dispatches.filter(e=>e.type!=='PRODUCT_DETAILS_REQUEST');assert.equal(complete.length,1);assert.equal(complete[0].type,'PRODUCT_DETAILS_SUCCESS');assert.equal(complete[0].payload._id,'new');
});
