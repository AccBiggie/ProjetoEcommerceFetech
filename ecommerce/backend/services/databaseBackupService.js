const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { MongoClient } = require('mongoose').mongo;
const { databaseName, targetName, paths, fail } = require('../utils/backupContract');
const { runTool, toolConnection } = require('../utils/backupTools');
const { canonical, snapshotDatabase, criticalInvariants, verifyDatabase } = require('../utils/backupVerification');
const marker = 'fetech_restore_guard';
async function sha256(file) { const hash = crypto.createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
function sourceName(uri) { return databaseName(new MongoClient(uri).options.dbName); }
function safeHost(uri) { const client = new MongoClient(uri); return client.options.hosts?.map(String).join(',') || 'SRV'; }
function restoreUri(uri) {
    const client = new MongoClient(uri), parsed = new URL(uri);
    if (client.options.credentials && !parsed.searchParams.has('authSource')) parsed.searchParams.set('authSource', client.options.credentials.source);
    // Namespace mapping is explicit; no URI database may become an implicit --db.
    parsed.pathname = '/';
    return parsed.toString();
}
async function connect(uri) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, readPreference: 'primary' });
    try { await client.connect(); if (!(await client.db('admin').command({ hello: 1 })).setName) fail('BACKUP_TOPOLOGY_REQUIRED', 'Backup/restore exige replica set.'); return client; }
    catch (error) { await client.close(); throw error; }
}
async function oplogBoundary(client) {
    const row = await client.db('local').collection('oplog.rs').find({}).sort({ $natural: -1 }).limit(1).next();
    if (!row?.ts) fail('BACKUP_CONSISTENCY_UNAVAILABLE', 'Não foi possível verificar a janela do oplog. Backup não validado.');
    return row.ts;
}
async function assertQuiet(client, database, start, end) {
    const oplog = client.db('local').collection('oplog.rs'), oldest = await oplog.find({}).sort({ $natural: 1 }).limit(1).next();
    if (!oldest?.ts || oldest.ts.toBigInt() > start.toBigInt()) fail('BACKUP_CONSISTENCY_UNAVAILABLE', 'Janela do oplog perdida; repita em período sem escrita.');
    for await (const row of oplog.find({ ts: { $gt: start, $lte: end } })) {
        if (row.ns?.startsWith(database + '.') || row.o?.applyOps?.some(operation => operation.ns?.startsWith(database + '.')) || row.o?.commitTransaction) fail('BACKUP_SOURCE_CHANGED', 'A origem recebeu escrita durante a captura. Backup incompleto; repita em período sem escrita.');
    }
}
async function regularFile(file, maxSize = Infinity) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > maxSize) fail('BACKUP_ARTIFACT_INVALID', 'Artefato inválido, vazio, incompleto ou link simbólico.');
    return stat;
}
async function loadBackup(directory) {
    if (path.basename(directory).endsWith('.partial')) fail('BACKUP_INCOMPLETE', 'Backup partial não pode ser restaurado.');
    const files = paths(directory);
    await regularFile(files['backup-manifest.json'], 1024 * 1024);
    await regularFile(files['backup-manifest.sha256'], 128);
    const expected = (await fs.readFile(files['backup-manifest.sha256'], 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(expected) || await sha256(files['backup-manifest.json']) !== expected) fail('BACKUP_CHECKSUM_INVALID', 'Checksum do manifesto inválido; restore não iniciado.');
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(files['backup-manifest.json'], 'utf8')); } catch { fail('BACKUP_MANIFEST_INVALID', 'Manifesto inválido.'); }
    databaseName(manifest.database);
    if (manifest.formatVersion !== 1 || manifest.complete !== true || manifest.consistency !== 'QUIESCENT_OPLOG_VERIFIED' ||
        typeof manifest.collections !== 'object' || !manifest.collections || Array.isArray(manifest.collections) ||
        typeof manifest.invariants !== 'object' || !manifest.invariants || Array.isArray(manifest.invariants) ||
        !/^[a-f0-9]{64}$/.test(manifest.archiveSha256) || !Number.isSafeInteger(manifest.archiveBytes) || manifest.archiveBytes < 1) fail('BACKUP_MANIFEST_INVALID', 'Versão ou estrutura do manifesto não suportada.');
    for (const [name, row] of Object.entries(manifest.collections)) {
        if (name === marker || !/^[a-z][a-z0-9_]*$/.test(name) || !Number.isSafeInteger(row?.count) || row.count < 0 || !Number.isSafeInteger(row.indexCount) || row.indexCount < 1 ||
            !['dataSha256', 'indexesSha256', 'optionsSha256'].every(field => /^[a-f0-9]{64}$/.test(row[field]))) fail('BACKUP_MANIFEST_INVALID', 'Metadata de collection inválida.');
    }
    const stat = await regularFile(files['database.archive.gz']);
    if (stat.size !== manifest.archiveBytes || await sha256(files['database.archive.gz']) !== manifest.archiveSha256) fail('BACKUP_CHECKSUM_INVALID', 'Checksum do archive inválido; restore não iniciado.');
    return { manifest, files };
}
async function backupDatabase({ uri, output, tools, signal, write = console.log }) {
    const database = sourceName(uri), started = Date.now();
    await fs.mkdir(path.resolve(output), { recursive: true, mode: 0o700 });
    const directory = path.join(path.resolve(output), database + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID());
    await fs.mkdir(directory, { mode: 0o700 });
    const files = paths(directory), partial = files['database.archive.gz'] + '.partial';
    write(JSON.stringify({ operation: 'READ_ONLY_BACKUP', database, host: safeHost(uri), output: directory }));
    const client = await connect(uri);
    try {
        const start = await oplogBoundary(client), db = client.db(database), collections = await snapshotDatabase(db), invariants = await criticalInvariants(db);
        if (Object.hasOwn(collections, marker)) fail('BACKUP_COLLECTION_UNSUPPORTED', 'Origem contém marcador de restore incompleto; capture uma origem comercial íntegra.');
        await toolConnection(uri, config => runTool(tools.mongodump.executable, ['--config', config, '--db', database, '--archive=' + partial, '--gzip'], { signal }));
        const after = await snapshotDatabase(db), afterInvariants = await criticalInvariants(db), end = await oplogBoundary(client);
        await assertQuiet(client, database, start, end);
        if (canonical(collections) !== canonical(after) || canonical(invariants) !== canonical(afterInvariants)) fail('BACKUP_SOURCE_CHANGED', 'Origem mudou durante backup; cópia não validada.');
        const stat = await regularFile(partial), archiveSha256 = await sha256(partial);
        if (signal?.aborted) fail('BACKUP_CANCELLED', 'Backup cancelado; cópia incompleta.');
        await fs.rename(partial, files['database.archive.gz']);
        const manifest = { formatVersion: 1, complete: true, database, createdAt: new Date().toISOString(),
            consistency: 'QUIESCENT_OPLOG_VERIFIED', mongoToolsVersion: { mongodump: tools.mongodump.version, mongorestore: tools.mongorestore.version },
            archiveBytes: stat.size, archiveSha256, collections, invariants, backupDurationMs: Date.now() - started };
        await fs.writeFile(files['backup-manifest.json'], JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await fs.writeFile(files['backup-manifest.sha256'], await sha256(files['backup-manifest.json']) + '\n', { flag: 'wx', mode: 0o600 });
        write(JSON.stringify({ operation: 'BACKUP_COMPLETE', database, archiveBytes: stat.size, durationMs: manifest.backupDurationMs, collections: Object.keys(collections).length }));
        return { directory, manifest };
    } finally { await client.close(); }
}
async function restoreDatabase({ uri, backup, target, confirmation, tools, signal, write = console.log }) {
    const { manifest, files } = await loadBackup(backup);
    targetName(target, manifest.database, sourceName(uri), confirmation);
    const client = await connect(uri), db = client.db(target), started = Date.now();
    try {
        if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) fail('RESTORE_TARGET_NOT_EMPTY', 'Destino já contém collections; restore abortado, sem --drop/--replace.');
        await db.createCollection(marker); // Atomic reservation against concurrent managed restores.
        if ((await db.listCollections({}, { nameOnly: true }).toArray()).some(row => row.name !== marker)) fail('RESTORE_TARGET_NOT_EMPTY', 'Destino recebeu collections concorrentes; restore abortado.');
        write(JSON.stringify({ operation: 'RESTORE_NEW_DATABASE', database: target, host: safeHost(uri) }));
        await toolConnection(restoreUri(uri), config => runTool(tools.mongorestore.executable, ['--config', config, '--archive=' + files['database.archive.gz'], '--gzip',
            '--nsInclude=' + manifest.database + '.*', '--nsFrom=' + manifest.database + '.*', '--nsTo=' + target + '.*', '--stopOnError'], { signal }));
        const result = await verifyDatabase(db, manifest, { ignore: [marker] });
        if (signal?.aborted) fail('RESTORE_CANCELLED', 'Restore cancelado; destino não validado.');
        await db.collection(marker).drop();
        const report = { operation: 'RESTORE_VERIFIED', database: target, ...result, durationMs: Date.now() - started };
        write(JSON.stringify(report)); return report;
    } finally { await client.close(); }
}
async function verifyBackup({ uri, backup, target, confirmation, write = console.log }) {
    const { manifest } = await loadBackup(backup);
    targetName(target, manifest.database, sourceName(uri), confirmation);
    const client = await connect(uri);
    try { const result = await verifyDatabase(client.db(target), manifest); write(JSON.stringify({ operation: 'VERIFY_READ_ONLY', database: target, ...result })); return result; }
    finally { await client.close(); }
}
module.exports = { sha256, sourceName, safeHost, loadBackup, backupDatabase, restoreDatabase, verifyBackup };
