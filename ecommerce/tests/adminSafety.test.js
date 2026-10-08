const { testUri } = require('./replicaSetHarness');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./authHarness');
let admin, cookie;
before(h.start); after(h.stop);
beforeEach(async () => { await h.User.deleteMany({}); await h.clearRateLimits(); admin = await h.createUser('admin'); cookie = await h.login(admin); });
const count = () => h.User.countDocuments({ role: 'admin' });
const put = (target, role, session = cookie, extra = {}) => h.request('PUT', '/admin/user/' + target.id, { role, ...extra }, session);
const del = (target, session = cookie) => h.request('DELETE', '/admin/user/' + target.id, null, session);
const factory = options => require('../backend/services/adminSafetyService').createAdminSafetyService(options);
const locks = options => require('../backend/services/adminMutationLock').createAdminMutationLock(options);
const model = () => require('../backend/models/adminMutationLockModel');
const input = suffix => ({ name: 'Primeiro administrador', email: 'bootstrap' + suffix + '@admin.example.test', password: h.password, confirmPassword: h.password });
test('AS-01 autoexclusão retorna 403 e preserva admin', async () => { assert.equal((await del(admin)).status, 403); assert.equal(await count(), 1); });
test('AS-02 autorrebaixamento retorna 403', async () => { assert.equal((await put(admin,'user')).status,403); assert.equal((await h.User.findById(admin.id)).role,'admin'); });
for (const [id,action] of [['03','rebaixamento'],['04','exclusão']]) test('AS-'+id+' invariante do último admin: '+action, async () => {
    const { ensureAnotherAdmin } = require('../backend/services/adminSafetyService');
    await locks().run(async () => assert.rejects(ensureAnotherAdmin(h.User), e => e.statusCode === 409));
    assert.equal(await count(),1);
});
test('AS-05 outro admin pode ser rebaixado',async()=>{const b=await h.createUser('admin');assert.equal((await put(b,'user')).status,200);assert.equal(await count(),1);});
test('AS-06 outro admin pode ser excluído',async()=>{const b=await h.createUser('admin');assert.equal((await del(b)).status,200);assert.equal(await count(),1);});
test('AS-07 usuário pode ser promovido',async()=>{const b=await h.createUser();assert.equal((await put(b,'admin')).status,200);assert.equal(await count(),2);});
test('AS-08 user não altera role',async()=>{const b=await h.createUser();assert.equal((await put(admin,'user',await h.login(b))).status,403);});
test('AS-09 user não exclui conta',async()=>{const b=await h.createUser();assert.equal((await del(admin,await h.login(b))).status,403);});
for(const [id,deleteA,deleteB] of [['10',false,false],['11',true,false],['12',true,true]]) test('AS-'+id+' concorrência destrutiva mantém admin',async()=>{
 const b=await h.createUser('admin'),cb=await h.login(b);
 const replies=await Promise.all([deleteA?del(b):put(b,'user'),deleteB?del(admin,cb):put(admin,'user',cb)]);
 assert.equal(replies.filter(r=>r.status===200).length,1);assert.ok(replies.every(r=>[200,403,409,401].includes(r.status)));assert.equal(await count(),1);
});
test('AS-13 lock compartilhado entre conexões independentes',async()=>{
 const connection=await mongoose.createConnection(testUri(h.database)).asPromise();
 const a=locks({acquireTimeoutMs:40}),other=connection.model('AdminMutationLock',model().schema),b=locks({Model:other,acquireTimeoutMs:40});
 try{const lease=await a.acquire();try{await assert.rejects(b.acquire(),e=>e.statusCode===409);}finally{await a.release(lease);}const next=await b.acquire();await b.release(next);}finally{await connection.close();}
});
test('AS-14 lease expirado é recuperado sem TTL',async()=>{const l=locks(),old=await l.acquire();await model().updateOne({_id:old.id},{lockedUntil:new Date(0)});const current=await l.acquire();assert.ok(current.fence>old.fence);await l.release(current);});
test('AS-15 owner incorreto não libera lock',async()=>{const l=locks(),lease=await l.acquire();await l.release({...lease,owner:'incorrect-owner'});await l.assertHeld(lease);await l.release(lease);});
test('AS-16 exception libera lock no finally',async()=>{const l=locks();await assert.rejects(l.run(async()=>{throw new Error('Falha controlada');}));const lease=await l.acquire();await l.release(lease);});
test('AS-17 bootstrap zero admins cria um admin',async()=>{await h.User.deleteMany({});await factory().bootstrap(input('first'));assert.equal(await count(),1);});
test('AS-18 bootstrap com admin existente é recusado sem alterar User',async()=>{
 const before=(await h.User.findById(admin.id).select('+adminMutationFence')).adminMutationFence;
 await assert.rejects(factory().bootstrap(input('refused')),e=>e.statusCode===409);assert.equal(await count(),1);
 assert.equal((await h.User.findById(admin.id).select('+adminMutationFence')).adminMutationFence,before);
});
test('AS-19 bootstraps concorrentes criam somente um admin',async()=>{await h.User.deleteMany({});const results=await Promise.allSettled([factory().bootstrap(input('a')),factory().bootstrap(input('b'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count(),1);});
test('AS-20 bootstrap usa hook bcrypt e login normal',async()=>{await h.User.deleteMany({});const a=await factory().bootstrap(input('hash'));const value=await h.User.findById(a.id).select('+password');assert.ok(value.password!==h.password,'Senha armazenada em claro');assert.equal(await value.comparePassword(h.password),true);await h.request('GET','/me',null,await h.login(a),200);});
test('AS-21 bootstrap exige senha fornecida sem default',async()=>{await h.User.deleteMany({});const body=input('missing');delete body.password;await assert.rejects(factory().bootstrap(body),e=>e.statusCode===400);assert.equal(await count(),0);});
test('AS-22 cadastro público continua criando user',async()=>{const r=await h.request('POST','/register',{...input('public'),role:'admin'},null,201);assert.equal(r.result.user.role,'user');});
test('AS-23 body não modifica tokenVersion nem fence',async()=>{const b=await h.createUser();const r=await put(b,'admin',cookie,{tokenVersion:999,adminMutationFence:999});assert.equal(r.status,200);assert.equal((await h.User.findById(b.id)).tokenVersion,0);assert.ok(!('adminMutationFence' in r.result.user));});
test('AS-24 rebaixamento retira acesso admin do JWT atual',async()=>{const b=await h.createUser('admin'),cb=await h.login(b);await put(b,'user');await h.request('GET','/admin/users',null,cb,403);await h.request('GET','/me',null,cb,200);});
test('AS-25 admin removido não autentica com JWT anterior',async()=>{const b=await h.createUser('admin'),cb=await h.login(b);await del(b);await h.request('GET','/me',null,cb,401);});
test('AS-26 exclusão de user comum permanece funcional',async()=>{const b=await h.createUser();assert.equal((await del(b)).status,200);assert.equal(await h.User.findById(b.id),null);});
test('AS-27 CLI aborta confirmação errada sem criar User',async()=>{
 await h.User.deleteMany({});const {runBootstrapCli}=require('../backend/scripts/bootstrapAdmin');
 let preparations=0;const result=await runBootstrapCli({connection:h.User.db,service:factory(),prompt:async()=> 'wrong',prepare:async()=>{preparations++;},write:()=>{}});assert.equal(result,1);assert.equal(await count(),0);assert.equal(preparations,0);
});
test('AS-28 bootstrap rejeita nome, email, senha e confirmação inválidos',async()=>{
 await h.User.deleteMany({});for(const patch of [{name:'a'},{email:'invalid'},{password:'short',confirmPassword:'short'},{confirmPassword:'different'}]){await assert.rejects(factory().bootstrap({...input('invalid'),...patch}),e=>e.statusCode===400);}assert.equal(await count(),0);
});
test('AS-29 CLI não imprime senha e confirma banco',async()=>{
 await h.User.deleteMany({});const {runBootstrapCli}=require('../backend/scripts/bootstrapAdmin');const body=input('cli'),values=[h.database,body.name,body.email,body.password,body.confirmPassword],outputs=[],hidden=[];
 let preparations=0;const result=await runBootstrapCli({connection:h.User.db,service:factory(),prompt:async(label,secret)=>{hidden.push(Boolean(secret));return values.shift();},prepare:async()=>{assert.equal(values.length,4);preparations++;},write:line=>outputs.push(line)});
 assert.equal(result,0);assert.ok(!outputs.join('\n').includes(h.password),'Senha na saída');assert.deepEqual(hidden,[false,false,false,true,true]);assert.equal(await count(),1);assert.equal(preparations,1);
});
test('AS-30 nenhum default/argv de senha/config secreto adicionado',async()=>{
 const cli=fs.readFileSync(path.join(__dirname,'../backend/scripts/bootstrapAdmin.js'),'utf8');assert.ok(!cli.includes('DEFAULT_ADMIN_PASSWORD'));assert.ok(!cli.includes('ADMIN_BOOTSTRAP_SECRET'));
 const {main}=require('../backend/scripts/bootstrapAdmin');const outputs=[];assert.equal(await main({argv:['--password','redacted'],write:line=>outputs.push(line)}),1);assert.ok(!outputs.join().includes('redacted'),'Argumento exposto');
});
test('AS-31 atualização própria sem rebaixamento preserva contrato',async()=>{
 const r=await put(admin,'admin',cookie,{name:'Administrador atualizado'});assert.equal(r.status,200);assert.equal(r.result.user.role,'admin');
});
test('AS-32 bootstrap recusa email existente sem promover ou trocar senha',async()=>{
 await h.User.deleteMany({});const user=await h.createUser();await assert.rejects(factory().bootstrap({...input('existing'),email:user.email}),e=>e.statusCode===409);
 const saved=await h.User.findById(user.id).select('+password');assert.equal(saved.role,'user');assert.equal(await saved.comparePassword(h.password),true);assert.equal(await count(),0);
});
test('AS-33 executor é recarregado após aquisição do lock',async()=>{
 const b=await h.createUser('admin'),target=await h.createUser(),lock=locks();
 const service=factory({lock:{...lock,run:callback=>lock.run(async lease=>{await h.User.updateOne({_id:admin.id},{role:'user'});return callback(lease);})}});
 await assert.rejects(service.deleteUser(admin.id,target.id),e=>e.statusCode===403);assert.ok(await h.User.findById(target.id));assert.equal(await count(),1);
});
test('AS-34 escrita pausada após expiração não remove último admin',async()=>{
 const b=await h.createUser('admin'),first=factory(),second=factory(),original=h.User.findOneAndUpdate;
 let ready,release;const waiting=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});
 h.User.findOneAndUpdate=async function(filter,...args){if(String(filter._id)===b.id){ready();await gate;}return original.call(this,filter,...args);};
 const pending=first.updateUser(admin.id,b.id,{role:'user'}).then(()=>200,e=>e.statusCode);
 try{await waiting;await model().updateOne({_id:'admin-user-mutation'},{lockedUntil:new Date(0)});await second.updateUser(b.id,admin.id,{role:'user'});release();assert.equal(await pending,409);assert.equal(await count(),1);}
 finally{release();h.User.findOneAndUpdate=original;await pending;}
});
test('AS-35 serviços em conexões independentes mantêm admin',async()=>{
 const b=await h.createUser('admin'),connection=await mongoose.createConnection(testUri(h.database)).asPromise();
 try{const User=connection.model('User',h.User.schema),Model=connection.model('AdminMutationLock',model().schema),other=factory({User,lock:locks({Model})});
 const results=await Promise.allSettled([factory().deleteUser(admin.id,b.id),other.updateUser(b.id,admin.id,{role:'user'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count(),1);}
 finally{await connection.close();}
});
test('AS-36 bootstrap atrasado após lease usa mesmo ID e não duplica admin',async()=>{
 await h.User.deleteMany({});const original=h.User.prototype.save;let ready,release,calls=0;
 const waiting=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});
 h.User.prototype.save=async function(...args){if(this.isNew&&this.role==='admin'&&++calls===1){ready();await gate;}return original.apply(this,args);};
 const pending=factory().bootstrap(input('late')).then(()=>200,e=>e.statusCode);
 try{await waiting;await model().updateOne({_id:'admin-user-mutation'},{lockedUntil:new Date(0)});await factory().bootstrap(input('new'));release();assert.equal(await pending,409);assert.equal(await count(),1);}
 finally{release();h.User.prototype.save=original;await pending;}
});
test('AS-37 prompt de senha oculta o eco e não mantém histórico',async()=>{
 const {PassThrough}=require('node:stream'),{createInteractivePrompt}=require('../backend/scripts/bootstrapAdmin');
 const input=new PassThrough(),output=new PassThrough();input.isTTY=true;input.setRawMode=()=>{};let captured='';output.on('data',data=>{captured+=data.toString();});
 const interactive=createInteractivePrompt(input,output);
 try{const answer=interactive.prompt('Senha: ',true);input.write(h.password+'\r');assert.ok(await answer===h.password,'Entrada não preservada');assert.ok(!captured.includes(h.password),'Senha ecoada');}
 finally{interactive.close();input.destroy();output.destroy();}
});
test('AS-38 lock antigo não libera lease do novo owner',async()=>{
 const lock=locks(),old=await lock.acquire();await model().updateOne({_id:old.id},{lockedUntil:new Date(0)});const current=await lock.acquire();await lock.release(old);await lock.assertHeld(current);await lock.release(current);
});
test('AS-39 bootstrap não existe como endpoint HTTP',async()=>{
 await h.request('POST','/bootstrap-admin',{},null,404);await h.request('POST','/admin/bootstrap',{},cookie,404);
});
test('AS-40 recuperação de admin/user preserva contrato F009',async()=>{
 const user=await h.createUser(),a=await h.request('POST','/password/forgot',{email:admin.email},null,200),b=await h.request('POST','/password/forgot',{email:user.email},null,200);
 assert.deepEqual(a.result,b.result);assert.deepEqual(Object.keys(a.result).sort(),['message','success']);assert.ok(!JSON.stringify(a.result).includes(admin.email),'PII na resposta');
});
test('AS-41 login de admin criado por bootstrap preserva quota F008',async()=>{
 await h.User.deleteMany({});const a=await factory().bootstrap(input('limiter'));await h.login(a);
 for(let i=0;i<5;i++) await h.request('POST','/login',{email:a.email,password:'invalid-fixture'},null,401);
 await h.request('POST','/login',{email:a.email,password:'invalid-fixture'},null,429);
});
