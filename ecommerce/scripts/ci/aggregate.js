const { aggregate } = require('./policy');
try { aggregate(JSON.parse(process.env.NEEDS_JSON || '{}')); console.log('Commercial Gate aprovado.'); }
catch { console.error('Commercial Gate bloqueado: todos os seis jobs são obrigatórios.'); process.exitCode = 1; }
