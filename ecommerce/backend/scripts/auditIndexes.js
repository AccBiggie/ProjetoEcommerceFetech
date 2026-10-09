require('./indexes').main(process.argv.slice(2), true).then(code => { process.exitCode = code; });
