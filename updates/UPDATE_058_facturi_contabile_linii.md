# UPDATE 058 - Facturi contabile cu linii

Versiune: 2.12.37 -> 2.12.38
Data: 2026-06-14

## Context

Exporturile Saga din `E:\CODEX 1\Saga export` arata fluxul real pentru `Intrari`, `Iesiri` si `Articole contabile`.
Documentele nu trebuie tinute doar ca total, ci trebuie sa poata avea linii de produse/servicii care genereaza articole contabile.

## Modificari backend

- Facturile de intrare si iesire accepta `lines`.
- Fiecare linie contine:
  - denumire;
  - cont contabil;
  - valoare fara TVA;
  - procent TVA;
  - TVA calculat;
  - total linie.
- Totalurile facturii se calculeaza din linii cand acestea exista.
- Validarea facturii de intrare genereaza:
  - debit pe conturile din linii;
  - debit TVA in `4426`;
  - credit furnizor analitic.
- Validarea facturii de iesire genereaza:
  - debit client analitic;
  - credit pe conturile de venit din linii;
  - credit TVA in `4427`.

## Modificari frontend

- Formularul de factura are tabel de linii.
- Se pot adauga/elimina linii in draft.
- Fiecare linie are denumire, cont, valoare si TVA.
- Preview-ul arata baza, TVA si totalul calculat.

## Verificari

- `node --check server/modules/accounting/accounting-engine.js`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run build` in `client`
- Test logic local: factura intrare cu doua linii genereaza nota contabila echilibrata.

