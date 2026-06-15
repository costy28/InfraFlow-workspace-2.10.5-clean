# UPDATE 068 - Legatura Contabilitate - Controlling

Versiune: 2.12.47 -> 2.12.48
Data: 2026-06-15

## Ce s-a schimbat

- Am adaugat campuri de legatura pentru facturi si note contabile:
  - `cost_center_id`
  - `subcentru_id`
  - `santier_id` pe facturi.
- Facturile de intrare/iesire permit selectarea centrului cost/profit si a subcentrului.
- Notele contabile generate pastreaza centrul si subcentrul pe antet si linii.
- La validarea unei facturi de intrare se creeaza automat o intrare in Controlling cu sursa `factura_furnizor`.
- La devalidare se creeaza o intrare inversa in Controlling, pastrand auditul si regula append-only.
- Intrarea in Controlling pastreaza documentul, furnizorul si categoria dedusa din contul contabil.

## Migrare SQL

- `db/migrations/028_accounting_controlling_link.sql`

## Verificari recomandate

- Deschide o factura de intrare draft.
- Alege centru cost/profit si subcentru.
- Valideaza factura si verifica butonul `Nota`.
- Verifica in Controlling ca apare intrarea cu sursa `factura_furnizor`.
- Devalideaza cu motiv si verifica aparitia intrarii inverse.
