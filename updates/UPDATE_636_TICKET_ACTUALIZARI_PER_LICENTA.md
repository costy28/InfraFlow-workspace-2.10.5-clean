# UPDATE 636 — Ticket per licență pentru actualizări

**Versiune:** 2.12.616  
**Data:** 2 octombrie 2026

## Ce aduce

- serviciul `infraflow-updates` poate valida o credențială unică de instalație;
- registrul central reține doar hash-ul SHA-256 al credențialei, niciodată valoarea în clar;
- endpoint-ul `POST /tickets` emite un ticket HMAC de maximum 60 de minute;
- ticket-ul este legat de versiune, arhivă, componentă și platformă;
- arhivele se descarcă doar cu `Authorization: UpdateTicket ...`, fără secrete în URL;
- componentele de tip `module` sunt refuzate dacă nu sunt incluse în licența clientului.

## Limită intenționată

Aceasta este fundația sigură de distribuție. Instanțele InfraFlow încă folosesc actualizarea manuală; conectarea automată a instanței la endpoint-ul de ticket se activează separat, după configurarea licențelor pilot.
