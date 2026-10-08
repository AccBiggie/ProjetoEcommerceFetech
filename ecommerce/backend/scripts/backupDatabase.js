require('./databaseOperations').main('backup').then(code => { process.exitCode = code; });
