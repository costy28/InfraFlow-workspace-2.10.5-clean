# UPDATE 181 - Salarizare, plati si validare D112

Versiune: 2.12.160 -> 2.12.161

## Salarizare

- Cazuri speciale distincte: prime, avantaje, concedii medicale, tichete de masa, avansuri, popriri si alte retineri.
- Concediul medical necesita codul certificatului si confirmarea operatorului inainte de validare.
- Regimul fiscal al tichetelor este explicit in profilul fiscal; aplicatia nu presupune automat cote care pot varia legislativ.
- Fluturasi individuali si colectivi, plus registru de plata Excel.

## Banca si trezorerie

- Profiluri bancare configurabile pentru XLSX si CSV delimitat cu punct si virgula.
- Plata salariilor genereaza operatia de trezorerie si nota `421 = cont bancar`.
- Plata si nota salariala se storneaza controlat, in ordine, cu motiv si audit.
- Devalidarea statului este blocata cat timp exista plata sau nota contabila activa.

## D112

- Upload XML pentru validarea prin comanda DUK configurata local.
- Sunt pastrate codul de iesire, mesajele validatorului, SHA-256 si utilizatorul.
- InfraFlow marcheaza XML-ul acceptat numai daca procesul oficial se incheie fara erori.
- Configurare: `D112_VALIDATOR_PATH`, `D112_VALIDATOR_COMMAND`, `D112_VALIDATOR_ARGS` (JSON array cu `{file}`).

## Baza de date

- Migrare noua: `db/migrations/038_hr_payroll_payments_d112.sql`.
- Profiluri bancare, metadate pentru ajustari si legaturi complete intre stat, trezorerie si note contabile.
