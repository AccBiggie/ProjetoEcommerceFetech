// Only the pinned server executable is extracted. Database Tools remain absent (F024).
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root } = require('./policy');
async function main() {
    if (process.platform !== 'linux') throw new Error('Instalador CI exige Ubuntu 24.04.');
    const folder = path.join(root, '.local'); await fs.mkdir(folder, { recursive: true });
    const archive = path.join(folder, 'mongodb-server.tgz');
    const response = await fetch('https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2404-8.0.26.tgz', { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Download oficial Mongo indisponível.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== 'e5be0cc89d7439cd3fd49d78030c590c7d6f0d1bfe615ac54a30751b5d4c63f4') throw new Error('Checksum Mongo divergente.');
    await fs.writeFile(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', folder, '--strip-components=2', 'mongodb-linux-x86_64-ubuntu2404-8.0.26/bin/mongod']);
    await fs.unlink(archive); console.log('MongoDB Server 8.0.26 instalado; Database Tools não instaladas.');
}
main().catch(() => { console.error('Instalação segura do Mongo falhou.'); process.exitCode = 1; });
