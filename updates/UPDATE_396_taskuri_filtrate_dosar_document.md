# UPDATE 396 — Task-uri filtrate din dosarul documentului

Versiune: `2.12.376`  
Data: `2026-07-24`

## Scop

Închiderea buclei dintre Documente și Task-uri: după ce dosarul documentului afișează task-urile legate, utilizatorul poate deschide panoul complet de task-uri direct filtrat pe documentul curent.

## Modificări

- Pagina `Task-uri` citește filtrele `source_type` și `source_id` din URL.
- Încărcarea `/api/tasks` transmite filtrele de sursă împreună cu scope-ul activ.
- Lista filtrată afișează un banner de context cu sursa ERP și ID-ul sursei.
- Bannerul include acțiune de revenire la lista completă de task-uri.
- Dosarul documentului are acțiunea `Vezi în Task-uri`.
- Butonul `Vezi toate task-urile` păstrează filtrul documentului.

## Validare recomandată

1. Deschide un document cu task-uri legate.
2. Apasă `Vezi în Task-uri`.
3. Verifică URL-ul `/taskuri?source_type=document&source_id=...`.
4. Verifică bannerul de filtru în pagina Task-uri.
5. Apasă `Arată toate task-urile` și confirmă revenirea la lista nefiltrată.
