# UPDATE 647 — Taburi interne de lucru

**Versiune:** 2.12.627  
**Data:** 3 octombrie 2026

## Ce aduce

- Pagina accesată din meniul ERP sau printr-un link intern este urmărită ca filă de lucru în aplicație, fără tab nou în browser.
- Utilizatorul poate reveni la o filă deschisă, iar ruta și parametrii ei sunt păstrate în sesiunea browserului după reîncărcare.
- Fiecare filă poate fi închisă manual; ultima filă nu se închide pentru a menține un spațiu de lucru activ.

## Limite intenționate

Funcția păstrează contextul de navigare (ruta și parametrii). Datele nesalvate dintr-un formular rămân responsabilitatea paginii curente și nu sunt salvate automat.
