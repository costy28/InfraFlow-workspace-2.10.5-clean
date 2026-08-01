# UPDATE 458 — Flux simplu Registru jurnal

Versiune: `2.12.438`  
Data: `2026-08-01`

## Scop

Registrul jurnal este coloana vertebrală a contabilității: de aici se alimentează balanța, Cartea Mare, fișa contului și rapoartele lunare. Ecranul avea date și acțiuni, dar nu evidenția suficient starea lunii și următorul pas.

## Modificări

- Adăugat panou „Flux simplu registru jurnal” în `client/src/pages/accounting/RegistruJurnal.jsx`.
- Flux vizibil: lună/filtru → note → drafturi/devalidate → diferență debit-credit.
- Recomandare automată:
  - fără note: creează notă manuală;
  - drafturi: filtrează drafturile pentru validare;
  - devalidate: filtrează notele devalidate pentru corectare/revalidare;
  - diferență debit-credit: verifică Balanța;
  - registru coerent: export Excel.
- Indicatori suplimentari:
  - note devalidate;
  - note stornate;
  - total debit;
  - total credit.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Rezultat

Registrul jurnal devine un ecran de control, nu doar o listă de note. Utilizatorul vede imediat dacă luna poate merge mai departe spre balanță și rapoarte.
