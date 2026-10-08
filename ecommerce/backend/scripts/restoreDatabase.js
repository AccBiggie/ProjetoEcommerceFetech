require('./databaseOperations').main('restore').then(code => { process.exitCode = code; });
