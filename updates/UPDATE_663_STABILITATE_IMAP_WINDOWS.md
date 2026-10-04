# UPDATE 663 — Stabilitate sincronizare IMAP pe Windows

**Versiune:** 2.12.643  
**Data:** 4 Octombrie 2026

## Ce se modifică

- Clientul IMAP păstrează un listener de eroare pe durata conexiunii.
- O închidere tranzitorie a conexiunii de către provider, inclusiv `ECONNRESET`, este raportată sincronizării curente și nu mai ajunge ca excepție globală a procesului Node.
- Serverul local continuă să ruleze; sincronizarea emailului va fi reluată la următorul interval configurat.

## Impact

- Nu se modifică setările SMTP/IMAP, mesajele sau datele organizației.
- Este un hotfix de stabilitate pentru instalările Windows cu sincronizare automată a inboxului activă.
