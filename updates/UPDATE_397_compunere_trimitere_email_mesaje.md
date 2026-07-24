# UPDATE 397 — Compunere și trimitere email din Mesaje

Versiune: `2.12.377`  
Data: `2026-07-24`

## Scop

Transformarea Inbox ERP din zonă exclusiv de primire/triage într-un punct de lucru bidirecțional: utilizatorul poate compune și trimite emailuri direct din modulul Mesaje.

## Modificări backend

- Endpoint-ul existent `POST /api/messaging/email/send` continuă să trimită email prin SMTP.
- După trimitere reușită, emailul este salvat automat în registrul ERP cu:
  - `direction=outbound`;
  - `status=read`;
  - `from` preluat din setările SMTP;
  - categorie și importanță.
- Lista `GET /api/messaging/email/inbox` acceptă filtrul:
  - `direction=inbound`;
  - `direction=outbound`;
  - fără `direction` pentru toate emailurile.

## Modificări frontend

- Tabul `Inbox ERP` are buton `Email nou`.
- Modalul de compunere include:
  - destinatar;
  - subiect;
  - mesaj;
  - categorie;
  - importanță.
- Lista emailurilor are filtru `Cutie`: `Inbox`, `Trimise`, `Toate`.
- După trimitere reușită, interfața comută pe `Trimise`.

## Limitări intenționate

- Atașamentele, CC și BCC sunt lăsate pentru update separat.
- Emailul real se trimite doar dacă SMTP este configurat corect în Setări.
- Copia în `Trimise` se salvează doar după trimitere reușită.

## Validare recomandată

1. Configurează SMTP în Setări.
2. Deschide `Mesaje` → `Inbox ERP`.
3. Apasă `Email nou`.
4. Completează destinatar, subiect și mesaj.
5. Trimite emailul.
6. Verifică lista `Trimise`.
