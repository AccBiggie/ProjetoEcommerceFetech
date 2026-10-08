const path = require('node:path');
const { Writable } = require('node:stream');
const readline = require('node:readline/promises');
const mongoose = require('mongoose');
const ErrorHander = require('../utils/errorHander');
const User = require('../models/userModel');
const { createAdminSafetyService } = require('../services/adminSafetyService');

function createInteractivePrompt(input = process.stdin, output = process.stdout) {
    let hidden = false;
    const maskedOutput = new Writable({ write(chunk, encoding, callback) {
        if (!hidden) output.write(chunk, encoding);
        callback();
    } });
    const rl = readline.createInterface({ input, output: maskedOutput, terminal: true, historySize: 0 });
    const abort = new AbortController();
    rl.on('SIGINT', () => { abort.abort(); rl.close(); });
    rl.on('close', () => abort.abort());
    return {
        prompt: async (label, secret = false) => {
            if (secret) { output.write(label); hidden = true; }
            try { return await rl.question(secret ? '' : label, { signal: abort.signal }); }
            finally { if (secret) { hidden = false; output.write('\n'); } }
        },
        close: () => rl.close(),
    };
}

async function runBootstrapCli({ connection, service = createAdminSafetyService(), prompt,
    prepare = async () => {},
    write = line => process.stdout.write(line + '\n') }) {
    try {
        write('Banco alvo: ' + connection.name);
        write('Host: ' + connection.host);
        write('Ambiente: ' + (process.env.NODE_ENV || 'não definido'));
        const count = await connection.model('User').countDocuments({ role: 'admin' });
        write('Administradores atuais: ' + count);
        if (count > 0) {
            write('Já existe pelo menos um administrador. Utilize a administração da aplicação para gerenciar outros administradores.');
            return 1;
        }
        if (await prompt('Digite o nome do banco para confirmar: ') !== connection.name) {
            write('Confirmação do banco incorreta. Operação cancelada.');
            return 1;
        }
        await prepare();
        const name = await prompt('Nome: '), email = await prompt('E-mail: ');
        const password = await prompt('Senha (entrada oculta): ', true);
        const confirmPassword = await prompt('Confirmar senha (entrada oculta): ', true);
        await service.bootstrap({ name, email, password, confirmPassword });
        write('Primeiro administrador criado com sucesso. Utilize o login normal da aplicação.');
        return 0;
    } catch (error) {
        write(error instanceof ErrorHander ? error.message : 'Bootstrap cancelado ou indisponível. Nenhuma credencial será exibida.');
        return 1;
    }
}

async function main({ argv = process.argv.slice(2), write = line => process.stdout.write(line + '\n') } = {}) {
    // Não aceitar argumentos nem credenciais via ambiente/arquivo.
    if (argv.length) { write('Este comando não aceita argumentos. Informe os dados no terminal interativo.'); return 1; }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        write('Execute em um terminal interativo. Provisionamento por stdin ainda não é suportado.'); return 1;
    }
    require('dotenv').config({ path: path.join(__dirname, '../config/config.env'), quiet: true });
    let interactive;
    try {
        if (!process.env.DB_URI) { write('Configure DB_URI no servidor antes do bootstrap.'); return 1; }
        // A consulta inicial não deve criar coleção/índice antes da confirmação.
        await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        interactive = createInteractivePrompt();
        return await runBootstrapCli({ connection: mongoose.connection, prompt: interactive.prompt,
            prepare: () => User.createIndexes(), write });
    } catch {
        write('Não foi possível executar o bootstrap. Verifique a conexão e a configuração do servidor.');
        return 1;
    } finally {
        interactive?.close();
        await mongoose.disconnect();
    }
}
module.exports = { main, runBootstrapCli, createInteractivePrompt };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
