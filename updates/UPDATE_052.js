module.exports = {
  id: "UPDATE_052",
  version: "2.12.31",
  title: "Contabilitate core",
  date: "2026-06-13",
  sourceReference: "Saga C 3.0 / clona/conturi.dbf",
  changes: [
    "Seed plan de conturi real Saga C cu 583 conturi.",
    "Motor contabil cu validare debit=credit, perioade inchise si storno.",
    "Terti contabili cu analitice automate 401.x si 4111.x.",
    "Facturi intrare/iesire, trezorerie, registru jurnal, balanta si fisa cont.",
    "Migrare SQL Server 2008 compatible pentru tabelele accounting_*.",
    "Frontend React pentru modulul Contabilitate si integrare in sidebar/licenta."
  ],
  files: [
    "data/accounting-chart-saga.json",
    "db/migrations/027_accounting_core.sql",
    "server/modules/accounting/accounting-engine.js",
    "server/modules/accounting/accounting-routes.js",
    "client/src/pages/accounting/*"
  ]
};
