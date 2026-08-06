# UPDATE 511 — Citire automată activitate documente urmărite

Versiune: `2.12.491`
Data: `2026-08-06`

## Ce s-a schimbat

- Activitatea nouă de pe documentele urmărite se marchează automat ca citită când utilizatorul deschide dosarul documentului.
- Se curăță doar notificările de tip `document_watch` ale utilizatorului curent.
- Se curăță doar notificările aferente documentului deschis.
- Răspunsul endpoint-ului de detalii include `watched_notifications_read`, ca să fie ușor de verificat câte notificări au fost închise.

## Backend

- Helper nou pentru identificarea cheilor de notificare ale documentului.
- Helper nou pentru marcarea notificărilor `document_watch` ca citite.
- `GET /api/documents/:uuid` face automat această curățare când utilizatorul are acces la document.
- Nu necesită migrare SQL nouă.

## Testare recomandată

1. Urmărește un document cu utilizatorul A.
2. Cu utilizatorul B, fă o acțiune pe document: lansează, aprobă, respinge, retrage sau partajează.
3. Cu utilizatorul A, verifică Dashboard → `Documente urmărite`: activitatea nouă trebuie să apară.
4. Deschide documentul.
5. Revino pe Dashboard: activitatea nouă pentru acel document trebuie să dispară.
