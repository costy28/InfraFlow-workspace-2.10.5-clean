# UPDATE 080 - Hotfix migrare contabilitate SQL

Versiune: 2.12.59 -> 2.12.60  
Data: 2026-06-18

## Context

Dupa instalarea update-ului 2.12.59, utilizatorul putea vedea mesajul ca lipsesc tabelele `accounting_invoice_in_lines`, `accounting_invoice_out_lines` si `accounting_relational_sync` pana la rularea manuala a pregatirii de schema.

## Modificari

- Migrarea contabilitatii ruleaza pregatirea/repararea schemei inainte de copierea datelor.
- Daca schema ramane incompleta, endpoint-ul intoarce eroare clara cu lista tabelelor lipsa.
- Statusul schemei distinge tabelele necesare sincronizarii contabile.
- Butonul din Setari a fost redenumit in `Verifica si migreaza contabilitatea`.
- Mesajul UI nu mai spune blocant `pregateste schema intai`, ci indica repararea automata la migrare.

## Verificari

- `node -c server/core/db.js`
- `node -c server/modules/accounting/relational-sync.js`
- `npm run build`
- `git diff --check`

