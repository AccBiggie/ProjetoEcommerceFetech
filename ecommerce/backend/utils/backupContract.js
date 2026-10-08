const path = require('node:path');
const names = ['database.archive.gz', 'backup-manifest.json', 'backup-manifest.sha256'];
class BackupError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fail(code, message) { throw new BackupError(code, message); }
function databaseName(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(value) || ['admin', 'local', 'config', 'test'].includes(value.toLowerCase())) fail('BACKUP_DATABASE_INVALID', 'Informe um database explícito da aplicação; databases de sistema não são permitidos.');
    return value;
}
function targetName(value, source, configured, confirmation) {
    databaseName(value);
    if (!/^fetech_restore_[a-z0-9_]+$/.test(value) || /prod|commercial|live/.test(value) || value === source || value === configured || confirmation !== value) fail('RESTORE_TARGET_FORBIDDEN', 'Restore exige destino novo fetech_restore_*, diferente da origem/configuração, e --confirm-target com o nome exato.');
    return value;
}
function parseArgs(argv, mode) {
    const allowed = mode === 'backup' ? ['output', 'tools-dir'] : ['backup', 'target-db', 'confirm-target', 'tools-dir'];
    const result = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i]?.slice(2), value = argv[i + 1];
        if (!argv[i]?.startsWith('--') || !allowed.includes(key) || key in result || typeof value !== 'string' || !value || value.startsWith('--') || value.includes('\0')) fail('BACKUP_ARGUMENT_INVALID', 'Argumentos inválidos. Não há --drop, --replace ou execução de shell.');
        result[key] = value;
    }
    for (const key of mode === 'backup' ? ['output'] : ['backup', 'target-db', 'confirm-target']) if (!result[key]) fail('BACKUP_ARGUMENT_REQUIRED', `Informe --${key}.`);
    return result;
}
function paths(directory) { return Object.fromEntries(names.map(name => [name, path.join(path.resolve(directory), name)])); }
module.exports = { BackupError, fail, databaseName, targetName, parseArgs, paths };
