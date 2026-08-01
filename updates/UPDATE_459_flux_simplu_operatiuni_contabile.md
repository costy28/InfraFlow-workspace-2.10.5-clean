# UPDATE 459 — Flux simplu Operațiuni contabile

Versiune: `2.12.439`  
Data: `2026-08-01`

## Scop

Pagina Operațiuni contabile adună multe zone importante: recepții și facturi, e-Factura, audit integritate, bancă, stocuri, imobilizări, amortizare și închidere anuală. Era puternică, dar cerea operatorului să scaneze manual toate cardurile.

## Modificări

- Adăugat panou „Flux simplu operațiuni contabile” în `client/src/pages/accounting/OperatiuniContabile.jsx`.
- Flux vizibil: surse → stocuri → control → închidere.
- Recomandare automată:
  - factură din NIR-uri selectate;
  - verificare diferențe NIR/factură și retururi;
  - generare note din stocuri;
  - potrivire bancară sigură;
  - export audit când există probleme;
  - calcul amortizare;
  - generare notă anuală;
  - report solduri;
  - export audit când totul pare coerent.
- Indicatori rapizi:
  - recepții nelegate;
  - bancă neclasificată;
  - stoc de contabilizat;
  - probleme audit integritate.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Rezultat

Operatorul vede primul blocaj contabil înainte să intre în cardurile detaliate. Pagina devine o consolă de lucru, nu o colecție mare de secțiuni.
