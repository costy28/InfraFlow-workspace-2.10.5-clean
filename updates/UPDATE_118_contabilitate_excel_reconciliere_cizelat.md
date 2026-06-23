# UPDATE 118 - Contabilitate: Excel reconciliere cizelat

Versiune: 2.12.98
Data: 2026-06-23

## Schimbari

- Exportul `Reconciliere_contabila_YYYY-MM.xlsx` este impartit in doua sheet-uri:
  - `Sumar` - verificari si status general;
  - `Probleme` - lista de lucru pentru corectii.
- Coloanele au latimi separate pentru fiecare sheet.
- Statusurile sunt afisate romanizat: `OK`, `Atentie`, `Critic`.
- Linkurile sunt generate ca URL-uri complete si sunt clicabile in Excel.
- Daca nu exista probleme, raportul afiseaza explicit `Fara probleme`.

## Scop

Raportul exportat trebuie sa poata fi citit rapid de contabil sau director, fara ajustari manuale de coloane dupa descarcare.

## Verificari recomandate

- Exporta reconcilierea din `Contabilitate -> Dashboard`.
- Deschide Excel-ul si verifica sheet-urile `Sumar` si `Probleme`.
- Verifica daca mesajele lungi si linkurile sunt lizibile.
