function validateE2E(status, records) {
    if (status !== 'passed' || !records.length || records.some(record => record.status !== 'passed' || record.expectedStatus !== 'passed' || record.retry !== 0)) throw new Error('E2E exige todos os casos aprovados, sem skip, falha esperada ou retry.');
}
class CommercialReporter {
    constructor() { this.records = []; }
    onTestEnd(test, result) { this.records.push({ status: result.status, expectedStatus: test.expectedStatus, retry: result.retry }); }
    onEnd(result) {
        try { validateE2E(result.status, this.records); console.log(`E2E Gate: ${this.records.length} aprovados, zero skips.`); }
        catch (error) { console.error(error.message); return { status: 'failed' }; }
    }
}
module.exports = CommercialReporter;
module.exports.validateE2E = validateE2E;
