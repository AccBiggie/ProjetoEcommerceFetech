const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const h = require('./authHarness');
const newPassword = 'TemporarySession123!';
let user, cookie;
before(h.start);
after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); user = await h.createUser(); cookie = await h.login(user); });
const me = (session, expected = 200) => h.request('GET', '/me', null, session, expected);
const logout = session => h.request('POST', '/logout', null, session, 200);
const version = async () => (await h.User.findById(user.id)).tokenVersion;
const changePassword = () => h.request('PUT', '/password/update', {
    oldPassword: h.password, newPassword, confirmPassword: newPassword,
}, cookie, 200);
async function resetPassword() {
    const token = await h.recoveryToken(user);
    const reply = await h.request('PUT', '/password/reset/' + token,
        { password: newPassword, confirmPassword: newPassword }, null, 200);
    return { token, reply };
}

test('TEST-01 JWT atual autentica com versão inicial e login não incrementa', async () => {
    await me(cookie);
    assert.equal(h.jwt.verify(cookie.slice(6), process.env.JWT_SECRET).tokenVersion, 0);
    await h.login(user);
    assert.equal(await version(), 0);
});
test('TEST-02 JWT legado sem tokenVersion retorna 401', async () => {
    await me(h.signedCookie(user), 401);
});
test('TEST-03 JWT com versão divergente retorna 401', async () => {
    await me(h.signedCookie(user, { tokenVersion: 1 }), 401);
});
test('TEST-04 logout revoga cópia manual do cookie anterior', async () => {
    const oldCookie = cookie;
    await me(oldCookie); await logout(oldCookie); await me(oldCookie, 401);
});
test('TEST-05 logout expira cookie HttpOnly', async () => {
    const reply = await logout(cookie);
    const header = reply.response.headers.get('set-cookie');
    assert.ok(/HttpOnly/i.test(header), 'HttpOnly ausente');
    const expiry = /Expires=([^;]+)/i.exec(header);
    assert.ok(expiry, 'Expiração ausente');
    assert.ok(new Date(expiry[1]).getTime() <= Date.now(), 'Cookie não expirado');
});
test('TEST-06 novo login após logout emite sessão válida na nova versão', async () => {
    await logout(cookie); const current = await h.login(user);
    await me(current);
    assert.equal(h.jwt.verify(current.slice(6), process.env.JWT_SECRET).tokenVersion, 1);
});
test('TEST-07 logout repetido com JWT revogado preserva sessão nova', async () => {
    await logout(cookie); const current = await h.login(user);
    await logout(cookie); await logout(cookie);
    await me(current); assert.equal(await version(), 1);
});
test('TEST-08 dois logouts simultâneos incrementam exatamente uma vez', async () => {
    await h.User.updateOne({ _id: user.id }, { tokenVersion: 3 });
    const current = await h.login(user);
    await Promise.all([logout(current), logout(current)]);
    assert.equal(await version(), 4); await me(current, 401);
});
test('TEST-09 troca de senha revoga JWT antigo e autentica JWT novo', async () => {
    const reply = await changePassword();
    await me(cookie, 401); await me(h.cookieOf(reply));
    assert.equal(await version(), 1);
});
test('TEST-10 senha antiga deixa de funcionar após alteração', async () => {
    await changePassword();
    await h.request('POST', '/login', { email: user.email, password: h.password }, null, 401);
    await me(await h.login(user, newPassword));
});
test('TEST-11 reset de senha revoga cópia do JWT anterior', async () => {
    await resetPassword(); await me(cookie, 401); assert.equal(await version(), 1);
});
test('TEST-12 sessão pós-reset e novo login permanecem válidos', async () => {
    const { reply } = await resetPassword();
    await me(h.cookieOf(reply)); await me(await h.login(user, newPassword));
});
test('TEST-13 reset é single-use e limpa hash e expiração', async () => {
    const { token } = await resetPassword();
    await h.request('PUT', '/password/reset/' + token, { password: newPassword, confirmPassword: newPassword }, null, 400);
    const saved = await h.User.findById(user.id);
    assert.equal(saved.resetPasswordToken, undefined); assert.equal(saved.resetPasswordExpire, undefined);
});
test('TEST-14 usuário removido não autentica com JWT capturado', async () => {
    await user.deleteOne(); await me(cookie, 401); await logout(cookie);
});
test('TEST-15 role persistida remove privilégios sem revogar autenticação', async () => {
    await h.User.updateOne({ _id: user.id }, { role: 'admin' });
    await h.request('GET', '/admin/users', null, cookie, 200);
    const operator = await h.createUser('admin'), operatorCookie = await h.login(operator);
    await h.request('PUT', '/admin/user/' + user.id, { role: 'user' }, operatorCookie, 200);
    await me(cookie); await h.request('GET', '/admin/users', null, cookie, 403);
    assert.equal(await version(), 0);
});
test('TEST-16 cadastro ignora tokenVersion controlado pelo cliente', async () => {
    const reply = await h.request('POST', '/register', { name: 'Cadastro seguro',
        email: 'register@auth.example.com', password: h.password, tokenVersion: 999 }, null, 201);
    const saved = await h.User.findById(reply.result.user._id);
    assert.equal(saved.tokenVersion, 0);
    assert.equal(h.jwt.verify(h.cookieOf(reply).slice(6), process.env.JWT_SECRET).tokenVersion, 0);
});
test('TEST-17 atualização de perfil ignora tokenVersion do cliente', async () => {
    await h.request('PUT', '/me/update', { name: 'Perfil atualizado', email: user.email, tokenVersion: 999 }, cookie, 200);
    assert.equal(await version(), 0); await me(cookie);
});
test('TEST-18 atualização administrativa ignora tokenVersion do cliente', async () => {
    const admin = await h.createUser('admin');
    await h.request('PUT', '/admin/user/' + user.id, { name: user.name, email: user.email, role: 'user', tokenVersion: 999 }, await h.login(admin), 200);
    assert.equal(await version(), 0); await me(cookie);
});
test('TEST-19 JWT expirado e assinatura inválida retornam mensagem genérica', async () => {
    const expired = await me(h.signedCookie(user, { tokenVersion: 0 }, { expiresIn: -1 }), 401);
    const invalid = await me('token=invalid', 401);
    const legacy = await me(h.signedCookie(user), 401);
    assert.equal(expired.result.success, false);
    assert.equal(expired.result.message, invalid.result.message);
    assert.equal(invalid.result.message, legacy.result.message);
});
test('TEST-20 versões ausentes, strings, arrays, objetos, negativas, floats e inseguras são rejeitadas', async () => {
    for (const tokenVersion of [null, '0', [], {}, -1, 0.5, true, Number.MAX_SAFE_INTEGER + 1]) {
        await me(h.signedCookie(user, { tokenVersion }), 401);
    }
    await me(h.signedCookie(user, { id: 'invalid', tokenVersion: 0 }), 401);
});
test('TEST-21 logout sem sessão, inválido, expirado ou legado não revoga versão atual', async () => {
    for (const session of [undefined, 'token=invalid', h.signedCookie(user),
        h.signedCookie(user, { tokenVersion: 0 }, { expiresIn: -1 }),
        h.signedCookie(user, { tokenVersion: '0' }), h.signedCookie(user, { tokenVersion: 10 })]) {
        const reply = await logout(session);
        assert.equal(reply.result.success, true);
        assert.ok(reply.response.headers.has('set-cookie'));
        assert.equal(await version(), 0);
    }
    await me(cookie);
});
test('TEST-22 logout revoga todas as sessões da versão corrente', async () => {
    const otherSession = await h.login(user);
    await logout(cookie); await me(cookie, 401); await me(otherSession, 401);
});
test('TEST-23 usuário legado sem campo persistido faz login e logout concorrente seguro', async () => {
    await h.User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: '' } });
    const current = await h.login(user);
    assert.equal(h.jwt.verify(current.slice(6), process.env.JWT_SECRET).tokenVersion, 0);
    await me(current);
    await Promise.all([logout(current), logout(current)]);
    assert.equal(await version(), 1); await me(current, 401);
});
test('TEST-24 usuário legado persiste versão e senha juntas na alteração e reset', async () => {
    for (const reset of [false, true]) {
        user = await h.createUser();
        await h.User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: '' } });
        cookie = await h.login(user);
        const reply = reset ? (await resetPassword()).reply : await changePassword();
        assert.equal(await version(), 1); await me(cookie, 401); await me(h.cookieOf(reply));
    }
});
test('TEST-25 senha rejeitada não incrementa versão nem revoga sessão', async () => {
    for (const body of [{ oldPassword: 'invalid', newPassword, confirmPassword: newPassword },
        { oldPassword: h.password, newPassword, confirmPassword: 'different' },
        { oldPassword: h.password, newPassword: 'short', confirmPassword: 'short' }]) {
        await h.request('PUT', '/password/update', body, cookie, 400);
        assert.equal(await version(), 0); await me(cookie);
    }
});
test('TEST-26 recuperação preserva SHA-256, expiração e limpeza quando SMTP falha', async () => {
    const token = await h.recoveryToken(user);
    const saved = await h.User.findById(user.id);
    assert.ok(saved.resetPasswordToken === crypto.createHash('sha256').update(token).digest('hex'), 'Hash de recuperação incorreto');
    assert.ok(saved.resetPasswordExpire > new Date());
    await h.User.updateOne({ _id: user.id }, { resetPasswordExpire: new Date(Date.now() - 1000) });
    await h.request('PUT', '/password/reset/' + token, { password: newPassword, confirmPassword: newPassword }, null, 400);
    h.setTransportFailure(true);
    try { await h.request('POST', '/password/forgot', { email: user.email }, null, 200); }
    finally { h.setTransportFailure(false); }
    const cleared = await h.User.findById(user.id);
    assert.equal(cleared.resetPasswordToken, undefined); assert.equal(cleared.resetPasswordExpire, undefined);
    assert.equal(await version(), 0); await me(cookie);
});

function holdPasswordSaves(count) {
    const original = h.User.prototype.save;
    let release, ready, rejectReady, seen = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
    const timeout = setTimeout(() => rejectReady(new Error('Save de senha não alcançado')), 10000);
    h.User.prototype.save = async function (...args) {
        if (this.id === user.id && this.isModified('password')) {
            if (++seen === count) { clearTimeout(timeout); ready(); }
            await gate;
        }
        return original.apply(this, args);
    };
    return { waiting, release, restore: () => {
        clearTimeout(timeout); h.User.prototype.save = original; release();
    } };
}

test('TEST-27 alteração iniciada antes de logouts não restaura versão antiga', async () => {
    const barrier = holdPasswordSaves(1);
    const pending = h.request('PUT', '/password/update', {
        oldPassword: h.password, newPassword, confirmPassword: newPassword,
    }, cookie);
    try {
        await barrier.waiting;
        await logout(cookie); await logout(await h.login(user));
        const current = await h.login(user);
        barrier.release();
        assert.equal((await pending).status, 401);
        assert.equal(await version(), 2); await me(current);
        await h.login(user); // A senha rejeitada não foi persistida.
    } finally { barrier.restore(); await pending; }
});

test('TEST-28 alterações simultâneas de senha não emitem duas sessões vencedoras', async () => {
    const barrier = holdPasswordSaves(2);
    const payload = { oldPassword: h.password, newPassword, confirmPassword: newPassword };
    const pending = Promise.all([h.request('PUT', '/password/update', payload, cookie),
        h.request('PUT', '/password/update', payload, cookie)]);
    try {
        await barrier.waiting; barrier.release();
        const replies = await pending;
        assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 401]);
        assert.equal(await version(), 1);
        await me(cookie, 401); await me(h.cookieOf(replies.find(reply => reply.status === 200)));
    } finally { barrier.restore(); await pending; }
});
