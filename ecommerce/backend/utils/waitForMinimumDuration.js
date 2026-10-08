const { performance } = require('node:perf_hooks');
const { setTimeout } = require('node:timers/promises');

async function waitForMinimumDuration(started, minimumMs, { now = () => performance.now(), sleep = setTimeout } = {}) {
    // Arredondar para cima: timers não devem encurtar o piso por truncamento.
    let remaining = minimumMs - (now() - started);
    while (remaining > 0) {
        await sleep(Math.ceil(remaining));
        remaining = minimumMs - (now() - started);
    }
}
module.exports = { waitForMinimumDuration };
