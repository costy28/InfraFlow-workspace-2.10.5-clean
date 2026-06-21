# UPDATE 102 - Contabilitate: nomenclatoare editabile

Versiune: 2.12.81 -> 2.12.82
Data: 2026-06-21

## Ce s-a schimbat

- Planul de conturi poate fi editat din pagina Contabilitate -> Plan de conturi.
- Pentru conturile existente se pot modifica denumirea, tipul A/P/B, categoria contului, marcajele TVA si statusul activ/inactiv.
- Simbolul contului ramane blocat la editare pentru a pastra legaturile cu facturile si notele contabile existente.
- Terții contabili au formular complet pentru CUI, reg. com., tara, judet, localitate, adresa, telefon, email, IBAN, banca, zile scadenta si TVA.
- Furnizorii/clientii pot fi dezactivati sau reactivati fara stergere fizica.
- Backend-ul pastreaza corect statusul inactiv la editarea unui tert si nu il reactiveaza accidental.

## Validari

- Conturile obligatorii pentru validari contabile nu pot fi dezactivate.
- Denumirea contului si denumirea tertului raman obligatorii.
- Orice modificare este auditata.

## Fisiere principale

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/PlanConturi.jsx`
- `client/src/pages/accounting/TertiContab.jsx`
