const fs = require('node:fs');
const path = require('node:path');
const { app, validateResults } = require('./policy');
module.exports = async function* (source) {
    const records = []; let summary;
    for await (const { type, data } of source) {
        if ((type === 'test:pass' || type === 'test:fail') && data.file) {
            records.push({ file: path.relative(app, data.file).replaceAll('\\', '/'), name: data.name, skip: data.skip, todo: data.todo, failed: type === 'test:fail' });
            yield `${type === 'test:fail' ? 'FAIL' : data.skip ? 'SKIP (validação obrigatória)' : 'PASS'} ${data.name}\n`;
        }
        if (type === 'test:summary' && data.file === undefined) summary = data;
    }
    const expected = fs.readdirSync(path.join(app, 'tests')).filter(file => file.endsWith('.test.js')).map(file => 'tests/' + file);
    try {
        if (!summary || summary.success !== true) throw new Error('Suite não terminou com sucesso.');
        const result = validateResults(records, expected);
        yield `API: ${result.cases} resultados; ${result.skips} bloqueios F024 autorizados.\n`;
    } catch (error) { process.exitCode = 1; yield `API GATE FAILED: ${error.message}\n`; }
};
