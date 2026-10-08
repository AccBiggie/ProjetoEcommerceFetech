const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
const { BackupError, parseArgs } = require('../utils/backupContract');
const { discoverTools } = require('../utils/backupTools');
const operations = require('../services/databaseBackupService');
async function main(mode, argv = process.argv.slice(2)) {
    const controller = new AbortController(), cancel = () => controller.abort();
    process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    try {
        const args = parseArgs(argv, mode);
        loadEnvironment(); const config = loadConfig(process.env, { profile: 'database-operations' });
        const tools = mode === 'verify' ? undefined : await discoverTools(args['tools-dir']);
        const options = { uri: config.mongo.uri, output: args.output, backup: args.backup, target: args['target-db'], confirmation: args['confirm-target'], tools, signal: controller.signal };
        await operations[mode === 'backup' ? 'backupDatabase' : mode === 'restore' ? 'restoreDatabase' : 'verifyBackup'](options);
        return 0;
    } catch (error) {
        console.error(error instanceof ConfigurationError || error instanceof BackupError ? error.message : 'Operação indisponível. Verifique Database Tools, conexão/permissões, espaço e integridade. Nenhuma cópia foi declarada validada.');
        return controller.signal.aborted ? 130 : 1;
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
module.exports = { main };
