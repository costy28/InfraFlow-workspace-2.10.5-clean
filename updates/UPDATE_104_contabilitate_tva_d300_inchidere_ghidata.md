# UPDATE 104 - Contabilitate: TVA/D300 si inchidere luna ghidata

Versiune: 2.12.83 -> 2.12.84
Data: 2026-06-21

## Ce s-a schimbat

- Jurnalul TVA si sumarul D300 includ implicit doar documente contabilizabile: validate, partiale, achitate/incasate si stornate.
- Documentele draft nu mai intra implicit in calculul TVA/D300.
- Pagina TVA/D300 afiseaza avertizari cand exista documente draft neincluse in calcul.
- Pagina TVA/D300 afiseaza sumar pe statusuri: numar intrari/iesiri si TVA aferent.
- Inchiderea lunii afiseaza linkuri directe pentru rezolvarea blocajelor:
  - facturi intrare draft
  - facturi iesire draft
  - trezorerie draft
  - note contabile draft/dezechilibrate
  - TVA neverificat
  - balanta dezechilibrata
- Paginile facturi, TVA/D300 si inchidere luna respecta parametrul `?luna=YYYY-MM`.

## Motiv

Fluxul de inchidere luna trebuie sa fie ghidat si contabil corect: drafturile raman vizibile ca avertizare, dar nu afecteaza declaratia de lucru TVA/D300.

## Fisiere principale

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/FacturiContab.jsx`
- `client/src/pages/accounting/TVADeclaratii.jsx`
- `client/src/pages/accounting/InchidereLuna.jsx`
