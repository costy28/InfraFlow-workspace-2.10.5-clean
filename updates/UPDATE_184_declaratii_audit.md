# UPDATE 184 - Declaratii si audit contabil end-to-end

Versiune: 2.12.163 -> 2.12.164

- Acelasi motor de validator local este disponibil pentru D300, D394 si D112, cu configuratii independente.
- Calendar orientativ distinct: D300/D112 ziua 25, D394 ziua 30, cu exceptia termenului D300 din decembrie.
- Alerte pentru termene apropiate, urgente si depasite.
- Checklistul fiscal include validarea externa si obligatiile salariale neplatite ca avertismente explicite.
- Audit transversal: factura -> nota -> trezorerie -> salarizare -> declaratie -> recipisa.
- Export Excel pentru auditul end-to-end.
- Referinte oficiale: D300 OPANAF 174/2026 si schema D394 aplicabila raportarilor curente.
- Migrare: `db/migrations/041_accounting_audit_indexes.sql`.
