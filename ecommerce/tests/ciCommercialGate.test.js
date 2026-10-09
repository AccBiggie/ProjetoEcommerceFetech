const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, app, skips, jobs, aggregate, validateResults, assertRunnerEnvironment, assertTestBase } = require('../scripts/ci/policy');
const { validateE2E } = require('../scripts/ci/e2eReporter');
const { context } = require('./helpers/e2eContext');
const blocked = () => skips.map(item => ({ file: item.file, name: item.name, skip: item.reason }));
const id = 'a'.repeat(32), base = 'mongodb://127.0.0.1:49123/admin?replicaSet=fetech_test_rs';
test('CI 15 skips F024 têm arquivo, identidade e motivo exatos', () => assert.equal(validateResults(blocked()).skips, 15));
test('CI F024 pode executar com Tools, sem exigir pass count fixo', () => assert.equal(validateResults(skips.map(item => ({ file: item.file, name: item.name }))).skips, 0));
for (const field of ['file', 'name', 'skip']) test('CI bloqueia skip adulterado: ' + field, () => { const rows = blocked(); rows[0][field] = 'unexpected'; assert.throws(() => validateResults(rows)); });
test('CI bloqueia F024 parcial', () => assert.throws(() => validateResults(blocked().slice(1))));
test('CI bloqueia F024 duplicado', () => assert.throws(() => validateResults([...blocked(), blocked()[0]])));
test('CI bloqueia todo backend', () => assert.throws(() => validateResults([{ file: 'tests/x.test.js', name: 'todo', todo: true }])));
test('CI bloqueia falha backend', () => assert.throws(() => validateResults([{ file: 'tests/x.test.js', name: 'failed', failed: true }])));
test('CI bloqueia relatório vazio/suite omitida', () => { assert.throws(() => validateResults([])); assert.throws(() => validateResults([{ file: 'x' }], ['y'])); });
test('CI E2E aprovado sem skips', () => assert.doesNotThrow(() => validateE2E('passed', [{ status: 'passed', expectedStatus: 'passed', retry: 0 }])));
for (const status of ['skipped', 'failed', 'timedOut', 'interrupted']) test('CI E2E bloqueia ' + status, () => assert.throws(() => validateE2E('passed', [{ status, expectedStatus: 'passed', retry: 0 }])));
test('CI E2E bloqueia falha esperada/retry/zero casos', () => { for (const rows of [[], [{ status: 'passed', expectedStatus: 'failed', retry: 0 }], [{ status: 'passed', expectedStatus: 'passed', retry: 1 }]]) assert.throws(() => validateE2E('passed', rows)); });
test('CI aggregate aceita exatamente os seis jobs aprovados', () => assert.doesNotThrow(() => aggregate(Object.fromEntries(jobs.map(job => [job, { result: 'success' }])))));
for (const status of ['failure', 'cancelled', 'skipped']) test('CI aggregate bloqueia dependência ' + status, () => { for (const job of jobs) { const needs = Object.fromEntries(jobs.map(name => [name, { result: name === job ? status : 'success' }])); assert.throws(() => aggregate(needs)); } });
test('CI aggregate bloqueia dependência ausente', () => assert.throws(() => aggregate({})));
test('CI DB_NAME fetech aborta antes de conexão/mutação', () => {
    const env = { ...process.env, DB_NAME: 'fetech' }; for (const key of ['DB_URI', 'MONGO_URI', 'MONGODB_URI', 'FETECH_TEST_MONGO_BASE']) delete env[key];
    const result = spawnSync(process.execPath, ['tests/runWithReplicaSet.js'], { cwd: app, env, windowsHide: true, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /Runner/);
});
test('CI runner aceita nome temporário válido e recusa URI externa', () => { assert.doesNotThrow(() => assertRunnerEnvironment({ DB_NAME: 'fetech_ci_123_456' })); assert.throws(() => assertRunnerEnvironment({ DB_URI: base })); });
test('CI testUri exige identidade além de NODE_ENV', () => { assert.throws(() => assertTestBase(base, undefined)); assert.doesNotThrow(() => assertTestBase(base, id)); });
for (const uri of ['mongodb://127.0.0.1:27017/admin?replicaSet=fetech_test_rs', 'mongodb://external.example:49123/admin?replicaSet=fetech_test_rs', 'mongodb://127.0.0.1:49123/fetech?replicaSet=fetech_test_rs']) test('CI base Mongo externa/comercial rejeitada: ' + new URL(uri).hostname + new URL(uri).pathname + new URL(uri).port, () => assert.throws(() => assertTestBase(uri, id)));
test('CI E2E contextos têm portas/estado/build separados', () => {
    const make = (name, port) => context({ FETECH_TEST_RUN_ID: id, FETECH_TEST_RUN_DIR: path.join(root, '.local/test-run-' + name), FETECH_E2E_ORIGIN: 'http://127.0.0.1:' + port });
    const a = make('a', 49123), b = make('b', 49124); assert.notEqual(a.state, b.state); assert.notEqual(a.origin, b.origin);
    assert.throws(() => context({ FETECH_TEST_RUN_ID: id, FETECH_TEST_RUN_DIR: root, FETECH_E2E_ORIGIN: 'https://example.com' }));
});
test('CI configuração isolada não chama dotenv nem lê config.env', () => {
    const env = { ...process.env, FETECH_TEST_RUN_ID: id };
    const result = spawnSync(process.execPath, ['-e', "require('dotenv').config=()=>{throw Error('leitura proibida')};require('./backend/config/runtimeConfig').loadEnvironment()"], { cwd: app, env, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0);
});
const workflow = JSON.parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')); // JSON is valid YAML 1.2.
test('CI workflow gatilhos PR/main, permissões mínimas e aggregate always', () => {
    assert.deepEqual(workflow.on, { pull_request: {}, push: { branches: ['main'] } }); assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.equal(workflow.jobs.commercial.name, 'Commercial Gate'); assert.deepEqual(workflow.jobs.commercial.needs, jobs); assert.equal(workflow.jobs.commercial.if, '${{ always() }}');
});
test('CI workflow versões exatas, locks separados e timeouts', () => {
    for (const job of Object.values(workflow.jobs)) { assert.equal(job['runs-on'], 'ubuntu-24.04'); assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 30); for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/); }
    for (const name of jobs) { const steps = workflow.jobs[name].steps; assert.ok(steps.some(step => step.with?.['node-version'] === '24.19.0')); assert.ok(steps.some(step => step.run === 'npm ci --prefix ecommerce')); assert.ok(steps.some(step => step.run === 'npm ci --prefix ecommerce/frontend')); assert.ok(steps.some(step => step.run === 'npm run ci:' + (name === 'repository' ? 'repo-safety' : name) + ' --prefix ecommerce')); }
});
test('CI workflow sem soft-fail/deploy/secrets/Tools/índices produtivos', () => {
    const source = JSON.stringify(workflow); assert.doesNotMatch(source, /continue-on-error|secrets\.|audit fix|migrate:indexes|upgrade:stock|mongodump|mongorestore|deploy/i);
    assert.match(workflow.concurrency.group, /github\.sha/); assert.match(workflow.concurrency['cancel-in-progress'], /pull_request/);
    const artifact = workflow.jobs.e2e.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')); assert.equal(artifact.if, 'failure()'); assert.equal(artifact.with['retention-days'], 7); assert.doesNotMatch(artifact.with.path, /\.local|state|env|mongo/);
});
for (const stage of ['API', 'build', 'E2E']) test('CI comando com falha bloqueia gate: ' + stage, async () => {
    const { run, sequence } = require('../scripts/ci/run'); let laterRan = false;
    await assert.rejects(sequence([['prior', async () => {}], [stage, () => run(['-e', 'process.exit(1)'], app, 10000)], ['later', async () => { laterRan = true; }]]));
    assert.equal(laterRan, false);
});
test('CI subprocesso trava: timeout reprova', async () => { const { run } = require('../scripts/ci/run'); await assert.rejects(run(['-e', 'setInterval(()=>{},1000)'], app, 100), /Timeout/); });
test('CI aggregate executável reprova needs ausente/falho', () => {
    for (const needs of [{}, Object.fromEntries(jobs.map(job => [job, { result: 'failure' }]))]) {
        const result = spawnSync(process.execPath, ['scripts/ci/aggregate.js'], { cwd: app, env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) }, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 1);
    }
});
