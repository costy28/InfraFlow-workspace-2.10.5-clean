# UPDATE 182 - Salarizare si obligatii bugetare

Versiune: 2.12.161 -> 2.12.162

- Centralizator separat pentru CAS, CASS, impozit pe salarii si CAM.
- Ordinele sunt generate numai din stat validat si nota contabila activa.
- Fiecare ordin are scadenta, cont contabil, status si export Excel.
- Plata creeaza operatia de trezorerie si nota de stingere; stornarea pastreaza istoricul si auditul.
- Migrare: `db/migrations/039_hr_payroll_obligations.sql`.
