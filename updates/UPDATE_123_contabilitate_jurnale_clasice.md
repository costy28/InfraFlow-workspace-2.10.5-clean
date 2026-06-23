# UPDATE 123 - Contabilitate jurnale clasice

Versiune: 2.12.102 -> 2.12.103
Data: 2026-06-23

## Continut

- Adaugat endpoint `GET /api/accounting/classic-journals` pentru jurnale contabile clasice.
- Adaugat endpoint `GET /api/accounting/classic-journals/export` cu export Excel pe foi separate.
- Adaugata pagina `Contabilitate -> Rapoarte -> Jurnale`.
- Jurnalele sunt grupate in:
  - Jurnal cumparari
  - Jurnal vanzari
  - Registru casa
  - Jurnal banca

## Observatii

- Nu introduce tabele noi; foloseste facturile, TVA-ul si trezoreria existente.
- Exportul foloseste autentificarea aplicatiei prin clientul API, nu deschidere directa de URL.
