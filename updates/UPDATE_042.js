module.exports = {
  id: "UPDATE_042",
  deliveredAs: "UPDATE_052",
  version: "2.12.31",
  title: "Modul Contabilitate Core",
  date: "2026-06-13",
  note: "UPDATE_042 era cerut in promptul initial, dar numarul 042 exista deja in istoricul repository-ului. Implementarea este livrata ca UPDATE_052 pentru a nu suprascrie istoricul.",
  sourceReference: "Saga C 3.0 / clona/conturi.dbf",
  changes: [
    "Plan de conturi real extras din Saga C, seed JSON cu 583 conturi.",
    "Tabele accounting_* pregatite prin migrare SQL Server 2008 compatible.",
    "Motor contabil cu validare debit=credit, perioada deschisa si sold activ fara credit negativ.",
    "Terti contabili cu analitice automate 401.x si 4111.x.",
    "Facturi intrare/iesire, trezorerie, registru jurnal, balanta, fisa cont, inchidere luna si alerte.",
    "Frontend React si integrare in sidebar/routing/licenta."
  ]
};
