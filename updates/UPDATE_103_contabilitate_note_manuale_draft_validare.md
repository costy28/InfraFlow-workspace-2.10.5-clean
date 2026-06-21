# UPDATE 103 - Contabilitate: note manuale draft si validare

Versiune: 2.12.82 -> 2.12.83
Data: 2026-06-21

## Ce s-a schimbat

- Notele contabile manuale se salveaza initial cu status `draft`.
- Notele draft si devalidate pot fi editate din Registru jurnal.
- Notele draft/devalidate pot fi validate manual dupa verificare.
- Notele active pot fi devalidate cu motiv, apoi corectate si revalidate.
- Notele draft pot fi anulate fara stergere fizica.
- Storno este permis doar pentru note active.

## Corectie importanta

- Drafturile nu mai sunt tratate ca note active.
- Balanta, fisa cont si soldurile iau in calcul doar notele cu status `activ`.

## Fisiere principale

- `server/modules/accounting/accounting-engine.js`
- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/RegistruJurnal.jsx`
