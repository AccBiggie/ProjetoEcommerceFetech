const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const app = path.join(root, 'ecommerce');
const backupNames = [
    'BACKUP mongodump/mongorestore reais, archive completo, manifesto e source intacta',
    'BACKUP collections, contagens, índices e dados BSON restaurados iguais',
    'BACKUP cents, shipping strings, payment, archive, tokenVersion e hashes preservados',
    'BACKUP claims e movements mantêm relações e reserva transacional',
    'BACKUP leitura funcional de Order/Product/User no alvo sem criar índices',
    'BACKUP restore repetido/destino não vazio aborta sem alteração',
    'BACKUP segunda captura usa diretório diferente sem overwrite',
    'BACKUP archive adulterado rejeitado antes de qualquer write',
    'BACKUP manifesto adulterado rejeitado antes de qualquer write',
    'BACKUP versão de manifesto desconhecida rejeitada',
    'BACKUP path traversal em metadata não constrói comandos/arquivos',
    'BACKUP partial e manifesto ausente são rejeitados',
    'BACKUP verifier detecta alteração de conteúdo mesmo mantendo count',
    'BACKUP falha real de tool não publica backup final ou restore validado',
    'BACKUP fluxo completo preserva origem e verificação separada READ_ONLY',
];
const skips = backupNames.map(name => ({ file: 'tests/backupRestore.test.js', name, reason: 'MongoDB Database Tools ausentes: restore real bloqueado.' }));
const jobs = ['repository', 'architecture', 'api', 'build', 'e2e', 'audit'];
function aggregate(needs) {
    if (!needs || Object.keys(needs).length !== jobs.length || jobs.some(job => needs[job]?.result !== 'success')) throw new Error('Commercial Gate: dependência ausente, falhou, cancelada ou skipped.');
}
function validateResults(records, expectedFiles = []) {
    const seen = new Set(), files = new Set();
    for (const record of records) {
        if (record.todo || record.failed) throw new Error('Resultado incompleto ou falho.');
        files.add(record.file);
        if (!record.skip) continue;
        const allowed = skips.find(item => item.file === record.file && item.name === record.name && item.reason === record.skip);
        if (!allowed || seen.has(record.name)) throw new Error('Skip não autorizado ou duplicado.');
        seen.add(record.name);
    }
    if (!records.length || expectedFiles.some(file => !files.has(file))) throw new Error('Relatório ausente ou suite incompleta.');
    // Sem Database Tools, todos os 15 casos conhecidos devem ser explicitamente bloqueados.
    // Com Tools, podem executar; um bloqueio parcial não é uma aprovação silenciosa.
    if (seen.size !== 0 && seen.size !== skips.length) throw new Error('Quantidade de skips F024 inconsistente.');
    return { cases: records.length, skips: seen.size };
}
function assertRunnerEnvironment(env) {
    if (env.DB_NAME && !/^fetech_[a-z][a-z0-9_]*_\d+_\d+$/.test(env.DB_NAME)) throw new Error('Banco externo/comercial proibido no runner.');
    if (env.DB_URI || env.MONGO_URI || env.MONGODB_URI || env.FETECH_TEST_MONGO_BASE) throw new Error('O runner cria sua própria identidade Mongo; não aceita URI externa.');
}
function assertTestBase(base, runId) {
    if (!/^[a-f0-9]{32}$/.test(runId || '')) throw new Error('Identidade temporária ausente.');
    const url = new URL(base);
    if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' || !url.port || ['27017', '27018'].includes(url.port) || url.username || url.password || url.pathname !== '/admin' || url.search !== '?replicaSet=fetech_test_rs') throw new Error('Mongo fora do contexto temporário.');
    return url;
}
module.exports = { root, app, skips, jobs, aggregate, validateResults, assertRunnerEnvironment, assertTestBase };
