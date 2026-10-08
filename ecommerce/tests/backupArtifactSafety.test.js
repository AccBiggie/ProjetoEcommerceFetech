// These files exercise integrity guards only; they are NOT BSON backups or a restore drill.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { loadBackup, sha256, restoreDatabase } = require('../backend/services/databaseBackupService');
const { canonical } = require('../backend/utils/backupVerification');
test('ARTIFACT hash canônico distingue tipos BSON e preserva zeros de strings', () => {
    const { BSON } = require('mongoose').mongo;
    assert.notEqual(canonical({ value: new BSON.Int32(1) }), canonical({ value: new BSON.Double(1) }));
    assert.notEqual(canonical({ value: '001' }), canonical({ value: 1 }));
    assert.equal(canonical({ b: 'x', a: new BSON.Int32(1) }), canonical({ a: new BSON.Int32(1), b: 'x' }));
});
async function fixture(action) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fetech-artifact-'));
    try {
        await fs.writeFile(path.join(directory, 'database.archive.gz'), 'INTEGRITY UNIT FIXTURE ONLY');
        const manifest = { formatVersion: 1, complete: true, database: 'synthetic_source', consistency: 'QUIESCENT_OPLOG_VERIFIED',
            archiveBytes: 27, archiveSha256: await sha256(path.join(directory, 'database.archive.gz')), collections: {}, invariants: {} };
        manifest.archiveBytes = (await fs.stat(path.join(directory, 'database.archive.gz'))).size;
        const publish = async () => {
            await fs.writeFile(path.join(directory, 'backup-manifest.json'), JSON.stringify(manifest));
            await fs.writeFile(path.join(directory, 'backup-manifest.sha256'), await sha256(path.join(directory, 'backup-manifest.json')));
        };
        await publish(); await action(directory, manifest, publish);
    } finally {
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('fetech-artifact-'));
        await fs.rm(directory, { recursive: true, force: true });
    }
}
test('ARTIFACT archive adulterado bloqueia restore antes de conexão', () => fixture(async directory => {
    await fs.appendFile(path.join(directory, 'database.archive.gz'), 'tampered');
    await assert.rejects(restoreDatabase({ backup: directory, uri: 'invalid-no-connection', target: 'fetech_restore_unit', confirmation: 'fetech_restore_unit' }), { code: 'BACKUP_CHECKSUM_INVALID' });
}));
test('ARTIFACT manifesto adulterado bloqueia leitura', () => fixture(async directory => {
    await fs.appendFile(path.join(directory, 'backup-manifest.json'), ' ');
    await assert.rejects(loadBackup(directory), { code: 'BACKUP_CHECKSUM_INVALID' });
}));
for (const [name, mutate, code] of [
    ['versão', m => { m.formatVersion = 2; }, 'BACKUP_MANIFEST_INVALID'],
    ['partial', m => { m.complete = false; }, 'BACKUP_MANIFEST_INVALID'],
    ['path traversal', m => { m.database = '../outside'; }, 'BACKUP_DATABASE_INVALID'],
    ['collection insegura', m => { m.collections['../outside'] = {}; }, 'BACKUP_MANIFEST_INVALID'],
    ['marcador reservado', m => { m.collections.fetech_restore_guard = {}; }, 'BACKUP_MANIFEST_INVALID'],
    ['count inválido', m => { m.collections.orders = { count: -1 }; }, 'BACKUP_MANIFEST_INVALID'],
    ['hash inválido', m => { m.archiveSha256 = 'bad'; }, 'BACKUP_MANIFEST_INVALID'],
]) test('ARTIFACT rejeita ' + name, () => fixture(async (directory, manifest, publish) => {
    mutate(manifest); await publish(); await assert.rejects(loadBackup(directory), { code });
}));
test('ARTIFACT checksum sidecar ausente impede leitura', () => fixture(async directory => {
    await fs.unlink(path.join(directory, 'backup-manifest.sha256')); await assert.rejects(loadBackup(directory));
}));
test('ARTIFACT arquivo vazio impede leitura', () => fixture(async directory => {
    await fs.writeFile(path.join(directory, 'database.archive.gz'), ''); await assert.rejects(loadBackup(directory), { code: 'BACKUP_ARTIFACT_INVALID' });
}));
test('ARTIFACT diretório partial é rejeitado sem acesso ao banco', async () => {
    await assert.rejects(loadBackup('incomplete.partial'), { code: 'BACKUP_INCOMPLETE' });
});
test('CLI ausência de ferramentas falha sem URI, senha, instalação ou conexão', () => {
    const result = spawnSync(process.execPath, ['backend/scripts/backupDatabase.js', '--output', 'unused-output', '--tools-dir', 'missing-tools-unit'], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true,
        env: { ...process.env, NODE_ENV: 'development', DB_URI: 'mongodb://synthetic:PRIVATE_PASSWORD@127.0.0.1:1/synthetic_source' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Database Tools/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PASSWORD|mongodb:\/\/|synthetic_source/);
});
