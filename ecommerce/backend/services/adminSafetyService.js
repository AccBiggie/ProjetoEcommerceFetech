const DefaultUser = require('../models/userModel');
const ErrorHander = require('../utils/errorHander');
const { createAdminMutationLock, conflict } = require('./adminMutationLock');

async function ensureAnotherAdmin(User) {
    if (await User.countDocuments({ role: 'admin' }) <= 1) {
        throw new ErrorHander('A operação deixaria o sistema sem administradores.', 409);
    }
}
function createAdminSafetyService({ User = DefaultUser, lock = createAdminMutationLock() } = {}) {
    const older = fence => ({ $or: [{ adminMutationFence: { $lt: fence } }, { adminMutationFence: { $exists: false } }] });
    async function fenceAdmins(lease) {
        // Uma aquisição nova invalida escritas atrasadas da geração anterior.
        // Não reduz gerações e conclui ANTES de recarregar executor/alvo/contagem.
        await User.updateMany({ role: 'admin', ...older(lease.fence) }, { $set: { adminMutationFence: lease.fence } });
        await lock.assertHeld(lease);
    }
    async function context(lease, executorId, targetId) {
        await fenceAdmins(lease);
        const executor = await User.findById(executorId);
        if (!executor || executor.role !== 'admin') throw new ErrorHander('Permissão administrativa necessária.', 403);
        // Alvos comuns também recebem geração, sem sobrescrever uma geração nova.
        await User.updateOne({ _id: targetId, role: 'user', ...older(lease.fence) },
            { $set: { adminMutationFence: lease.fence } });
        const target = await User.findById(targetId);
        if (!target) throw new ErrorHander('Usuário não encontrado.', 404);
        return target;
    }
    const filter = (target, lease) => ({ _id: target._id, role: target.role, adminMutationFence: lease.fence });
    async function updateUser(executorId, targetId, body, auditRequest) {
        if (body.role !== undefined && !['admin', 'user'].includes(body.role)) throw new ErrorHander('Perfil inválido.', 400);
        return lock.run(async lease => {
            const target = await context(lease, executorId, targetId);
            const reducing = target.role === 'admin' && body.role === 'user';
            if (reducing && String(executorId) === target.id) {
                throw new ErrorHander('Não é permitido remover sua própria permissão administrativa.', 403);
            }
            if (reducing) await ensureAnotherAdmin(User);
            await lock.assertHeld(lease);
            const mutate = async session => {
                const user = await User.findOneAndUpdate(filter(target, lease),
                    { name: body.name, email: body.email, role: body.role }, { returnDocument: 'after', runValidators: true, session });
                if (!user) throw conflict();
                const changedFields = ['name','email','role'].filter(key => user[key] !== target[key]);
                return { value: user, event: changedFields.length ? { action: user.role !== target.role ? 'USER_ROLE_CHANGED' : 'USER_UPDATED', targetId: user._id,
                    metadata: user.role !== target.role ? { fromRole: target.role, toRole: user.role } : { changedFields } } : undefined };
            };
            return auditRequest ? require('./adminAuditService').runAuditedAdminMutation(auditRequest, mutate, { connection: User.db }) : (await mutate()).value;
        });
    }
    async function deleteUser(executorId, targetId, auditRequest) {
        return lock.run(async lease => {
            const target = await context(lease, executorId, targetId);
            if (String(executorId) === target.id) throw new ErrorHander('Não é permitido excluir sua própria conta administrativa.', 403);
            if (target.role === 'admin') await ensureAnotherAdmin(User);
            await lock.assertHeld(lease);
            const mutate = async session => {
                const result = await User.deleteOne(filter(target, lease), { session });
                if (result.deletedCount !== 1) throw conflict();
                return { event: { action: 'USER_DELETED', targetId: target._id } };
            };
            if (auditRequest) await require('./adminAuditService').runAuditedAdminMutation(auditRequest, mutate, { connection: User.db });
            else await mutate();
        });
    }
    async function bootstrap(input) {
        if (typeof input.password !== 'string' || input.password !== input.confirmPassword) {
            throw new ErrorHander('Informe uma senha válida e uma confirmação correspondente.', 400);
        }
        const candidate = new User({ name: input.name, email: input.email, password: input.password,
            role: 'admin', avatar: { public_id: 'default-avatar', url: '/Profile.png' } });
        try { await candidate.validate(); }
        catch { throw new ErrorHander('Informe nome, e-mail e senha válidos.', 400); }
        return lock.run(async lease => {
            await lock.assertHeld(lease);
            if (await User.countDocuments({ role: 'admin' }) > 0) {
                throw new ErrorHander('Já existe pelo menos um administrador. Utilize a administração da aplicação para gerenciar outros administradores.', 409);
            }
            if (await User.exists({ email: candidate.email })) {
                throw new ErrorHander('Já existe uma conta com esse e-mail. Utilize outro e-mail; nenhuma conta será promovida automaticamente.', 409);
            }
            // O mesmo ID reservado protege até inserções atrasadas após perder lease.
            // Rotacionar somente quando o ID anterior JÁ existe (não pode ser reinserido).
            const occupied = await User.exists({ _id: lease.bootstrapUserId });
            candidate._id = occupied ? await lock.rotateBootstrapId(lease) : lease.bootstrapUserId;
            candidate.adminMutationFence = lease.fence;
            await lock.assertHeld(lease);
            try { await candidate.save(); }
            catch (error) {
                if (error.code === 11000) throw new ErrorHander('Conta já existente ou bootstrap concorrente. Verifique o estado antes de tentar novamente.', 409);
                throw new ErrorHander('Não foi possível criar o primeiro administrador.', 503);
            }
            return candidate;
        });
    }
    return { updateUser, deleteUser, bootstrap };
}
module.exports = { createAdminSafetyService, ensureAnotherAdmin };
