# UPDATE 583 — CRM Sprint 3: Oferte interne versionate

Versiune: `v2.12.563`  
Data: `2026-09-26`

## Ce aduce

- Editor complet pentru oferte în draft: poziții, validări, reordonare, discount și TVA.
- Calculul totalurilor este refăcut pe server, indiferent de valorile afișate în browser.
- Flux intern: `draft` → `pending_approval` → `approved` → `sent`; sunt disponibile și respingerea internă, anularea logică și revizia nouă.
- Oferta aprobată sau trimisă nu poate fi modificată; Revizia următoare pornește ca draft și păstrează neschimbată revizia anterioară.
- Document HTML print-ready persistat pentru oferta și revizia exactă; accesul este prin API autenticat, nu prin link direct la storage.
- Emailul trimis prin SMTP atașează documentul ofertei și este înregistrat în Inbox ERP cu sursa CRM.
- Audit explicit pentru creare, editare, linii, status, aprobare, respingere, revizie, document, email și anulare.

## Nu intră în acest update

- link public de ofertă;
- acceptare/refuz de către client;
- comenzi, verificare stoc sau necesar aprovizionare;
- facturare, Oblio sau SmartBill.

## Verificări

- teste CRM Sprint 1–3;
- verificare sintaxă Node;
- build React;
- verificare release și structură ZIP.
