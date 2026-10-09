const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
async function actionHarness() {
    const requests=[], dispatches=[];
    const axios={isCancel:()=>false,get(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));}};
    const key='__paginationAxios'+require('node:crypto').randomBytes(6).toString('hex');globalThis[key]=axios;
    const source=fs.readFileSync(require('node:path').resolve(__dirname,'../frontend/src/actions/productAction.js'),'utf8').replace(/import[\s\S]*?from\s+["'][^"']+["'];/g,'');
    const constants=['ALL_PRODUCT_FAIL','ALL_PRODUCT_REQUEST','ALL_PRODUCT_SUCCESS','PRODUCT_DETAILS_FAIL','PRODUCT_DETAILS_REQUEST','PRODUCT_DETAILS_SUCCESS','CLEAR_ERRORS'];
    const prefix=`const axios=globalThis.${key}; const getErrorMessage=e=>e.message; const ${constants.map(name=>`${name}='${name}'`).join(',')};\n`;
    const module=await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
    delete globalThis[key];
    return {getProduct:module.getProduct,requests,dispatches,dispatch:event=>dispatches.push(event)};
}
for(const fails of [false,true]) test('catálogo ignora '+(fails?'erro':'sucesso')+' antigo mesmo quando transporte ignora abort',async()=>{
    const h=await actionHarness();
    const old=h.getProduct('old',1)(h.dispatch), current=h.getProduct('current',2)(h.dispatch);
    assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[1].resolve({data:{products:[{name:'Atual'}],pagination:{page:2}}});await current;
    if(fails) h.requests[0].reject(Error('Erro antigo'));else h.requests[0].resolve({data:{products:[{name:'Antigo'}]}});
    await old;
    const complete=h.dispatches.filter(event=>event.type!=='ALL_PRODUCT_REQUEST');
    assert.equal(complete.length,1); assert.equal(complete[0].type,'ALL_PRODUCT_SUCCESS');assert.equal(complete[0].payload.products[0].name,'Atual');
});
