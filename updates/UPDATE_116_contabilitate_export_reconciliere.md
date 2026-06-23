# UPDATE 116 - Contabilitate: export reconciliere

Versiune: 2.12.96
Data: 2026-06-23

## Schimbari

- Adauga export Excel pentru reconcilierea lunara: `GET /api/accounting/reconciliation/export?luna=YYYY-MM`.
- Dashboard-ul contabil are buton `Export Excel` in cardul de reconciliere.
- Raportul exportat include:
  - verificarile lunii;
  - statusul fiecarei verificari;
  - problemele de rezolvat;
  - suma/restul/diferenta;
  - actiunea recomandata;
  - linkul functional catre zona de corectie.

## Scop

Contabilul poate pastra sau trimite situatia de verificare a lunii fara sa faca capturi de ecran sau sa caute manual prin module.

## Verificari recomandate

- Intra in `Contabilitate -> Dashboard`.
- Apasa `Export Excel` din cardul `Reconciliere lunara`.
- Verifica fisierul `Reconciliere_contabila_YYYY-MM.xlsx`.
