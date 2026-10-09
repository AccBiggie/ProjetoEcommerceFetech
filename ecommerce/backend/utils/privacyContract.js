const { error } = require('./mediaContract');
const REMOVED_NAME = 'Usuário removido';
const defaultAvatar = () => ({ public_id: 'default-avatar', url: '/Profile.png' });
const privacyStatusOf = user => user?.privacyStatus === undefined ? 'NORMAL' : user.privacyStatus;
const isAnonymized = user => privacyStatusOf(user) === 'ANONYMIZED';
const aliasPattern = /^anon-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}@privacy\.invalid$/;
const fail = (code, status = 409) => { throw error(code, status, ({ USER_ANONYMIZED: 'Esta conta foi anonimizada e não pode ser restaurada.', PRIVACY_USER_ACTIVE: 'Desative a conta antes da anonimização.', PRIVACY_USER_ADMIN: 'Remova o papel administrativo com segurança antes da anonimização.', PRIVACY_CONFIRMATION_INVALID: 'Informe a confirmação exata de anonimização.', PRIVACY_REQUEST_NOT_FOUND: 'Solicitação não encontrada.', PRIVACY_REQUEST_NOT_ACTIVE: 'A solicitação não está pendente.' })[code] || 'Não foi possível concluir esta operação de privacidade.'); };
function emptyBody(req, allowed = []) {
    if (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key))) fail('PRIVACY_BODY_INVALID', 400);
}
module.exports = { REMOVED_NAME, defaultAvatar, privacyStatusOf, isAnonymized, aliasPattern, fail, emptyBody };
