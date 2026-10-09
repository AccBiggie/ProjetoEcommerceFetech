const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');
const { start, capture } = require('./helpers/observabilityHarness');
const { storage, current } = require('../backend/observability/context');
const logger = require('../backend/observability/logger');
const { redact } = require('../backend/observability/redact');
const { requestContext } = require('../backend/middleware/requestContext');
const { loadConfig, ConfigurationError } = require('../backend/config/runtimeConfig');
const { configFixture } = require('./configFixtures');
let env, h;
before(async () => { env = await start(); h = env.h; });
after(async () => { if (env) await env.stop(); });
beforeEach(async () => { h.configure({ LOG_LEVEL: 'error' }); await h.clearRateLimits(); });
const id = reply => reply.response.headers.get('x-request-id');
test('OBS-01 GET normal possui UUID server-side e IDs distintos', async () => {
    const a = await h.request('GET','/products',null,null,200), b = await h.request('GET','/products');
    assert.match(id(a), logger.uuid); assert.match(id(b), logger.uuid); assert.notEqual(id(a),id(b));
});
test('OBS-02 header cliente não controla requestId interno', async () => {
    const reply = await h.request('GET','/products',null,null,200,{'X-Request-Id':'11111111-1111-4111-8111-111111111111'});
    assert.notEqual(id(reply),'11111111-1111-4111-8111-111111111111');
});
for (const [status,method,route,body,headers] of [
    [400,'PUT','/password/reset/invalid',{password:'x',confirmPassword:'x'}],
    [401,'GET','/me'], [403,'POST','/login',{}, {'X-Fetech-CSRF':'bad'}],
    [404,'GET','/missing/PRIVATE_PATH_SENTINEL'], [405,'GET','/logout'],
]) test('OBS HTTP '+status+' possui request ID', async () => { assert.match(id(await h.request(method,route,body,null,status,headers)),logger.uuid); });
test('OBS-08 erro 500 controlado correlaciona log/header e não vaza message/stack', async () => {
    h.configure({ LOG_LEVEL: 'debug' }); const original = h.User.findById;
    const user = await h.createUser(); const cookie = h.signedCookie(user,{tokenVersion:0});
    h.User.findById = () => { throw Object.assign(new Error('PRIVATE_ERROR_SENTINEL mongodb://x:PRIVATE_MONGO_SENTINEL@host/db'), { code: 'PRIVATE_ERROR_CODE_SENTINEL', name: 'PRIVATE_ERROR_NAME_SENTINEL' }); };
    try {
        const { result, output, logs } = await capture(() => h.request('GET','/me',null,cookie,500));
        assert.match(id(result),logger.uuid); assert.equal(result.result.stack,undefined);
        assert.doesNotMatch(JSON.stringify(result.result)+output,/PRIVATE_ERROR_SENTINEL|PRIVATE_MONGO_SENTINEL|PRIVATE_ERROR_CODE_SENTINEL|PRIVATE_ERROR_NAME_SENTINEL/);
        const error = logs.find(row=>row.event==='http.request.error'); assert.equal(error.requestId,id(result)); assert.equal(error.status,500);
        assert.equal(error.errorCode,'HTTP_500');assert.equal(error.errorName,'Error');
        assert.equal(logs.find(row=>row.event==='http.request.completed').requestId,id(result));
    } finally { h.User.findById=original; }
});
test('OBS-09 ALS em async profundo e 50 requests simultâneas permanece isolado', async () => {
    h.configure({ LOG_LEVEL: 'info' }); const app=express(); app.use(requestContext);
    app.get('/api/v1/probe/:id',async(req,res)=>{
        const first=current().requestId;
        await new Promise(resolve=>setTimeout(resolve,Number(req.params.id)%7));
        const deep=await Promise.resolve().then(async()=>{await new Promise(resolve=>setImmediate(resolve));return current().requestId;});
        res.json({first,deep,last:current().requestId});
    });
    const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const {result,logs}=await capture(()=>Promise.all(Array.from({length:50},async(_,i)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/probe/'+i);return {id:r.headers.get('x-request-id'),body:await r.json()};})));
        assert.equal(new Set(result.map(row=>row.id)).size,50); assert.equal(logs.length,50);
        for(const row of result){assert.equal(row.body.first,row.id);assert.equal(row.body.deep,row.id);assert.equal(row.body.last,row.id);assert.equal(logs.filter(log=>log.requestId===row.id).length,1);}
        assert.equal(current(),undefined);
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('OBS-10 JSON por linha, timestamp, rota template, método, duração e status', async () => {
    h.configure({LOG_LEVEL:'info'}); const {result,logs}=await capture(()=>h.request('GET','/products',null,null,200));
    assert.equal(logs.length,1);const row=logs[0];assert.equal(row.event,'http.request.completed');assert.equal(row.level,'info');assert.ok(Number.isFinite(Date.parse(row.timestamp)));assert.equal(row.route,'/api/v1/products');assert.equal(row.method,'GET');assert.equal(row.status,200);assert.ok(row.durationMs>=0);assert.equal(row.requestId,id(result));
});
test('OBS-11 actor ID/role disponível sem PII após autenticação', async()=>{
    const user=await h.createUser(); const cookie=await h.login(user);h.configure({LOG_LEVEL:'info'});
    const {logs,output}=await capture(()=>h.request('GET','/me',null,cookie,200));
    assert.equal(logs[0].userId,user.id);assert.equal(logs[0].role,'user');assert.ok(!output.includes(user.email));assert.ok(!output.includes(user.name));
});
const sentinels=['PRIVATE_RESET_SENTINEL','PRIVATE_QUERY_SENTINEL','PRIVATE_PASSWORD_SENTINEL','PRIVATE_JWT_SENTINEL','PRIVATE_COOKIE_SENTINEL','PRIVATE_IDEMPOTENCY_SENTINEL','PRIVATE_CSRF_SENTINEL','PRIVATE_ADDRESS_SENTINEL','PRIVATE_PHONE_SENTINEL','PRIVATE_ZIP_SENTINEL','PRIVATE_NAME_SENTINEL','PRIVATE_EMAIL_SENTINEL@example.test'];
test('OBS-12 paths reset/unmatched, query, body e headers não vazam sentinelas reais', async()=>{
    h.configure({LOG_LEVEL:'debug'});
    const {logs,output}=await capture(async()=>{
        await h.request('PUT','/password/reset/PRIVATE_RESET_SENTINEL?secret=PRIVATE_QUERY_SENTINEL',{password:'PRIVATE_PASSWORD_SENTINEL',confirmPassword:'PRIVATE_PASSWORD_SENTINEL',email:'PRIVATE_EMAIL_SENTINEL@example.test',shippingInfo:{recipientName:'PRIVATE_NAME_SENTINEL',address:'PRIVATE_ADDRESS_SENTINEL',phoneNo:'PRIVATE_PHONE_SENTINEL',pinCode:'PRIVATE_ZIP_SENTINEL'}},'token=PRIVATE_COOKIE_SENTINEL',400,{Authorization:'Bearer PRIVATE_JWT_SENTINEL','Idempotency-Key':'PRIVATE_IDEMPOTENCY_SENTINEL'});
        await h.request('GET','/unknown/PRIVATE_RESET_SENTINEL?secret=PRIVATE_QUERY_SENTINEL',null,null,404);
        await h.request('POST','/login',{password:'PRIVATE_PASSWORD_SENTINEL'},null,403,{'X-Fetech-CSRF':'PRIVATE_CSRF_SENTINEL'});
    });
    for(const sentinel of sentinels)assert.ok(!output.includes(sentinel),'Sentinela protegida não deve aparecer');
    assert.ok(logs.some(row=>row.route==='/api/v1/password/reset/:token'));assert.ok(logs.some(row=>row.route==='UNMATCHED'));
});
for(const key of ['password','passwordConfirm','token','jwt','Authorization','Cookie','Set-Cookie','secret','apiSecret','apiKey','idempotencyKey','resetToken','DB_URI','JWT_SECRET','PASSWORD','CLOUDINARY_API_SECRET','email','phoneNo','pinCode','recipientName','address','number','neighborhood','city','X-Fetech-CSRF','ip','User-Agent']) test('OBS redaction recursiva '+key,()=>{
    const value=JSON.stringify(redact({nested:[{[key]:'SUPER_SECRET_LOG_SENTINEL'}]})); assert.ok(!value.includes('SUPER_SECRET_LOG_SENTINEL'));
});
test('OBS-40 logger não serializa erros/config/payload, getters, unknown fields ou stacks',()=>{
    const lines=[], log=logger.createLogger({level:'debug',stdout:line=>lines.push(line),stderr:line=>lines.push(line)});
    const fields={message:'PRIVATE_SENTINEL',stack:'PRIVATE_SENTINEL',error:new Error('PRIVATE_SENTINEL'),config:{db:'PRIVATE_SENTINEL'},unknown:'PRIVATE_SENTINEL'};
    Object.defineProperty(fields,'route',{enumerable:true,get(){throw new Error('Getter should not execute');}});
    log.error('http.request.error',fields); assert.equal(lines.length,1);assert.ok(!lines[0].includes('PRIVATE_SENTINEL'));
    const cyclic={};cyclic.circular=cyclic;log.info('http.request.completed',cyclic);assert.equal(lines.length,2);
});
for(const level of ['debug','info','warn','error'])test('OBS LOG_LEVEL válido '+level,()=>assert.equal(loadConfig(configFixture({LOG_LEVEL:level})).logging.level,level));
for(const level of ['','DEBUG','verbose','PRIVATE_LOG_SENTINEL',null,7])test('OBS LOG_LEVEL inválido '+String(level),()=>{
    assert.throws(()=>loadConfig(configFixture({LOG_LEVEL:level})),error=>error instanceof ConfigurationError&&error.issues.some(i=>i.variable==='LOG_LEVEL')&&!error.message.includes('PRIVATE_LOG_SENTINEL'));
});
test('OBS defaults de logging e filtros/destinos funcionam',()=>{
    assert.equal(loadConfig(configFixture()).logging.level,'error');assert.equal(loadConfig(configFixture({NODE_ENV:'development'})).logging.level,'info');
    const out=[],err=[],log=logger.createLogger({level:'info',stdout:l=>out.push(l),stderr:l=>err.push(l)});
    log.debug('http.request.completed');log.info('http.request.completed');log.warn('http.request.error');log.error('http.request.error');assert.equal(out.length,1);assert.equal(err.length,2);
});
test('OBS liveness não consulta Mongo e health usa no-store/debug',async()=>{
    h.configure({LOG_LEVEL:'info'});const db=mongoose.connection.db,original=db.admin;
    db.admin=()=>{throw new Error('Liveness must not query DB');};
    try{const {result,logs}=await capture(()=>h.request('GET','/health/live',null,null,200));assert.deepEqual(result.result,{status:'ok'});assert.match(result.response.headers.get('cache-control'),/no-store/);assert.equal(logs.length,0);}finally{db.admin=original;}
});
test('OBS readiness replica set saudável retorna 200/body mínimo/requestId',async()=>{
    const r=await h.request('GET','/health/ready',null,null,200);assert.deepEqual(r.result,{status:'ok'});assert.match(id(r),logger.uuid);assert.match(r.response.headers.get('cache-control'),/no-store/);
});
test('OBS readiness sem Mongo retorna 503 sem reconectar/configuração',async()=>{
    await mongoose.disconnect();try{const r=await h.request('GET','/health/ready',null,null,503);assert.deepEqual(r.result,{status:'unavailable'});assert.match(id(r),logger.uuid);assert.equal(mongoose.connection.readyState,0);assert.match(r.response.headers.get('cache-control'),/no-store/);}finally{await mongoose.connect(process.env.DB_URI);}
});
test('OBS readiness falha de comando é segura e limitada',async()=>{
    const db=mongoose.connection.db,original=db.admin;let timeout;
    db.admin=()=>({command:async(_command,options)=>{timeout=options.timeoutMS;throw new Error('PRIVATE_MONGO_PASSWORD_SENTINEL');}});
    try{const {result,output}=await capture(()=>h.request('GET','/health/ready',null,null,503));assert.equal(timeout,1000);assert.deepEqual(result.result,{status:'unavailable'});assert.ok(!output.includes('PRIVATE_MONGO_PASSWORD_SENTINEL'));}finally{db.admin=original;}
});
test('OBS logger preserva requestId autoritativo do contexto',()=>{
    const lines=[],log=logger.createLogger({level:'info',stdout:l=>lines.push(JSON.parse(l))});const requestId=require('node:crypto').randomUUID();
    storage.run({requestId},()=>log.info('http.request.completed',{requestId:require('node:crypto').randomUUID()}));assert.equal(lines[0].requestId,requestId);
});
test('OBS errors SMTP e Cloudinary com secrets sentinelas nunca vazam',async()=>{
    const user=await h.createUser(),mail=require('nodemailer'),cloud=require('cloudinary');
    const boundary=require('../backend/services/mediaProvider');
    const originalMail=mail.createTransport,originalUpload=boundary.getProvider;
    h.configure({LOG_LEVEL:'debug',PASSWORD:'PRIVATE_SMTP_CONFIG_SENTINEL',CLOUDINARY_NAME:'fixture',CLOUDINARY_API_KEY:'PRIVATE_CLOUD_KEY_SENTINEL',CLOUDINARY_API_SECRET:'PRIVATE_CLOUD_SECRET_SENTINEL'});
    mail.createTransport=()=>({sendMail:async()=>{throw new Error('PRIVATE_SMTP_ERROR_SENTINEL');}});
    boundary.getProvider=()=>({uploadAvatar:async()=>{throw new Error('PRIVATE_CLOUD_ERROR_SENTINEL');}});
    try{
        const {output,logs}=await capture(async()=>{
            await h.request('POST','/password/forgot',{email:user.email},null,200);
            const cookie=await h.login(user),base=new URL((await h.request('GET','/me',null,cookie,200)).response.url);
            base.pathname='/api/v1/me/avatar';const form=new FormData();form.set('avatar',new Blob([await require('./helpers/mediaHarness').image()],{type:'image/png'}),'PRIVATE_FILENAME');
            const reply=await fetch(base,{method:'PUT',headers:{...require('./httpHeaders').withCsrf('PUT'),Cookie:cookie},body:form});assert.equal(reply.status,502);await reply.json();
        });
        assert.doesNotMatch(output,/PRIVATE_SMTP_|PRIVATE_CLOUD_|PRIVATE_NAME_|PRIVATE_EMAIL_|PRIVATE_PASSWORD_/);
        assert.ok(logs.some(row=>row.event==='password.recovery.email.failed'));assert.ok(logs.some(row=>row.event==='http.request.error'&&row.status===502));
    }finally{mail.createTransport=originalMail;boundary.getProvider=originalUpload;h.configure({LOG_LEVEL:'error'});}
});
test('OBS Set-Cookie e JWT reais da resposta não entram nos logs',async()=>{
    const user=await h.createUser();h.configure({LOG_LEVEL:'debug'});const {result,output}=await capture(()=>h.request('POST','/login',{email:user.email,password:h.password},null,200));
    const token=h.extractCookieValue(result.response.headers.getSetCookie());assert.ok(token);assert.ok(!output.includes(token));assert.ok(!output.includes(user.email));assert.ok(!output.includes(h.password));
});
test('OBS readiness rejeita topology sem transações',async()=>{
    const db=mongoose.connection.db,original=db.admin;db.admin=()=>({command:async()=>({logicalSessionTimeoutMinutes:30,maxWireVersion:25})});
    try{const r=await h.request('GET','/health/ready',null,null,503);assert.deepEqual(r.result,{status:'unavailable'});}finally{db.admin=original;}
});
