# UPDATE 081 - Hotfix blocaj migrari generale

Versiune: 2.12.60 -> 2.12.61  
Data: 2026-06-18

## Context

Migrarea contabilitatii putea esua inainte de copierea datelor deoarece pregatirea schemei rula toate migrarile SQL istorice. Pe instalarea curenta, o migrare veche de mesagerie avea un conflict de tip intre `core.users.id` si `messaging.channels.creat_de`.

## Modificari

- `prepareMssqlRelationalSchema()` trateaza erorile din migrarile generale ca avertisment.
- Repararea tabelelor critice pentru contabilitate continua chiar daca o migrare nelegata de contabilitate esueaza.
- Endpoint-ul de migrare contabilitate returneaza avertismentul separat in `preparedSchema.warning`.
- UI-ul afiseaza ca unele migrari generale au fost sarite, dar contabilitatea a continuat separat.

## Nota

Conflictul de schema din modulul Mesaje/Tickets ramane separat de migrarea contabilitatii si va fi tratat intr-un update dedicat, fara sa blocheze trecerea contabilitatii spre tabele relationale.

## Verificari

- `node -c server/core/db.js`
- `node -c server/modules/accounting/relational-sync.js`
- `node -c server/modules/system/routes.js`
- `npm run build`
- `git diff --check`

