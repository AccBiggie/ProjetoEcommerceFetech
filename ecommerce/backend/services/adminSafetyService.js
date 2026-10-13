const DefaultUser = require('../models/userModel');
const ErrorHander = require('../utils/errorHander');
const { createAdminMutationLock, conflict } = require('./adminMutationLock');
const { activeFilter, isActive, statusOf } = require('../utils/userLifecycle');

async function ensureAnotherAdmin(User) {
    if (await User.countDocuments({ role: 'admin', ...activeFilter() }) <= 1) {
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
        if (!isActive(executor) || executor.role !== 'admin') throw new ErrorHander('Permissão administrativa necessária.', 403);
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
            if (require('../utils/privacyContract').isAnonymized(target)) require('../utils/privacyContract').fail('USER_ANONYMIZED');
            const reducing = isActive(target) && target.role === 'admin' && body.role === 'user';
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
    async function changeStatus(executorId, targetId, nextStatus, auditRequest) {
        await require('./email/enqueue').modelFor(User.db).init();
        return lock.run(async lease => {
            const target = await context(lease, executorId, targetId);
            if (nextStatus === 'ACTIVE' && require('../utils/privacyContract').isAnonymized(target)) require('../utils/privacyContract').fail('USER_ANONYMIZED');
            if (nextStatus === 'DEACTIVATED' && String(executorId) === target.id) throw new ErrorHander('Não é permitido desativar sua própria conta administrativa.', 403);
            const previous = statusOf(target);
            if (!['ACTIVE', 'DEACTIVATED'].includes(previous)) throw new ErrorHander('Estado de conta inválido.', 409);
            if (previous === nextStatus) return target;
            if (nextStatus === 'DEACTIVATED' && target.role === 'admin') await ensureAnotherAdmin(User);
            if (nextStatus === 'DEACTIVATED' && !require('../utils/authSession').isValidVersion(target.tokenVersion)) throw conflict();
            await lock.assertHeld(lease);
            const mutate = async session => {
                const deactivating = nextStatus === 'DEACTIVATED';
                const update = { $set: { accountStatus: nextStatus, deactivatedAt: deactivating ? new Date() : null,
                    deactivatedBy: deactivating ? executorId : null } };
                if (deactivating) {
                    update.$inc = { tokenVersion: 1 };
                    update.$unset = { resetPasswordToken: '', resetPasswordExpire: '' };
                }
                const statusFilter = previous === 'ACTIVE' ? activeFilter() : { accountStatus: previous };
                // Version CAS prevents concurrent reset/logout from silently undoing a revocation.
                const user = await User.findOneAndUpdate({ $and: [filter(target, lease), statusFilter,
                    require('../utils/authSession').versionFilter(target.tokenVersion)] }, update,
                { returnDocument: 'after', runValidators: true, session });
                if (!user) throw conflict();
                await require('./email/enqueue').enqueue({ eventType: deactivating ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_REACTIVATED', recipientUserId: user._id, entityId: user._id, version: user.tokenVersion, requestId: auditRequest?.requestId || null }, session, User.db);
                return { value: user, event: { action: deactivating ? 'USER_DEACTIVATED' : 'USER_REACTIVATED', targetId: target._id,
                    metadata: { fromStatus: previous, toStatus: nextStatus } } };
            };
            return auditRequest ? require('./adminAuditService').runAuditedAdminMutation(auditRequest, mutate, { connection: User.db }) : require('./email/enqueue').domainTransaction(User.db, async session => (await mutate(session)).value);
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
            if (await User.countDocuments({ role: 'admin', ...activeFilter() }) > 0) {
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
    return { updateUser, deactivateUser: (executor, target, request) => changeStatus(executor, target, 'DEACTIVATED', request),
        reactivateUser: (executor, target, request) => changeStatus(executor, target, 'ACTIVE', request), bootstrap };
}
module.exports = { createAdminSafetyService, ensureAnotherAdmin };
