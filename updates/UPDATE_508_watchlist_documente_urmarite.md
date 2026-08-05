# UPDATE 508 — Watchlist documente urmărite

Versiune: `2.12.488`
Data: `2026-08-05`

## Obiectiv

Utilizatorul trebuie să poată ține sub observație documentele importante fără să le caute constant în toate listele.

## Implementare

- A fost adăugată acțiunea `Urmărește / Nu mai urmări` pe documente.
- Acțiunea este disponibilă:
  - în lista desktop;
  - în cardurile mobile;
  - în dosarul documentului;
  - în meniul de acțiuni.
- Lista Documente are filtru rapid `Urmărite`.
- Documentele urmărite afișează stea și badge vizibil.
- Urmărirea este salvată în `date_json.watchers`, fără tabel sau migrare nouă.
- Serverul expune endpoint-ul `POST /api/documents/:uuid/watch`.
- Marcarea și demarcarea sunt auditate.

## Rezultat

Documentele importante pot fi puse pe radar personal. Următorul pas natural este notificarea automată pentru documentele urmărite atunci când apare o decizie, un blocaj sau apropierea de termen.
