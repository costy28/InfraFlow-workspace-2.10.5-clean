const { readDb, writeDb, syncMssqlCpvCodes } = require('../server/core/db')
const { importSeed } = require('../server/modules/nomenclator/service')

const db = readDb()
const result = importSeed(db)
writeDb(db)
syncMssqlCpvCodes(db.cpvCodes)
console.log(`Importate: ${result.imported}, Duplicate sărite: ${result.duplicates}`)
