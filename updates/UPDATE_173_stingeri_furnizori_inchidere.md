# UPDATE 173 - Stingeri furnizori si inchidere consolidata

Versiune: `2.12.153`  
Data: `2026-06-27`

## Modificari

- O plata sau incasare validata poate fi alocata pe mai multe facturi ale aceluiasi tert.
- Distribuirea se poate face manual sau automat, FIFO dupa data scadentei.
- Sumele nealocate raman disponibile pentru stingeri ulterioare.
- Avansurile din conturile 409 si 419 pot fi transferate pe facturi prin note contabile dedicate.
- Un grup de stingeri poate fi anulat controlat; soldurile facturilor sunt restaurate si nota de transfer este stornata.
- Devalidarea unei operatii de trezorerie este blocata cat timp exista alocari active.
- Calculul soldului furnizor combina platile si notele de credit fara dublare.
- Fisa furnizor afiseaza rulajul anual, stingerile si alocarile; exportul Excel include foaia `Stingeri`.
- Jurnalul de cumparari separa facturile de notele de credit si afiseaza totalurile aferente.
- Verificarea de inchidere a lunii blocheaza notele de credit ramase in draft.

## Baza de date

- Migrare noua: `db/migrations/035_accounting_credit_settlements.sql`.
- Tabele relationale noi: `dbo.accounting_credit_notes` si `dbo.accounting_settlements`.
- Modul JSON ramane sursa compatibila pentru demo si dezvoltare locala.

## Verificare

- 33 teste automate contabile trecute.
- Build frontend trecut.
- Flux verificat in browser: plata de 300 RON distribuita FIFO pe doua facturi (121 + 179 RON).
- Verificare responsive la 390 x 844 px, fara depasirea latimii paginii si fara erori in consola.
