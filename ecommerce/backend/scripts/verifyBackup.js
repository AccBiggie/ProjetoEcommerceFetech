require('./databaseOperations').main('verify').then(code => { process.exitCode = code; });
