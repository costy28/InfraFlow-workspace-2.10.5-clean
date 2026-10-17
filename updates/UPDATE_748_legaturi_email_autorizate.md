# UPDATE 748 — Legături Email autorizate pe țintă

Versiune: **2.12.728**

Propunerile folosesc accesul existent în Contracte (permisiunea de modul), Documente (drept de consultare și acces pe entitate) și Task-uri (politica existentă de vizibilitate). Documentele relaționale sunt citite din SQL, cu pașii și partajările aferente, nu din snapshot-ul JSON.

Crearea unei legături cere o țintă accesibilă și existentă; nu mai acceptă fallback către un ID arbitrar. Eticheta și URL-ul sunt canonice. ID-ul numeric vechi al documentului este recunoscut și normalizat către UUID pentru noile legături. Rezolvarea directă nu este limitată la primele 80 de propuneri.

Legăturile existente inaccesibile sau orfane sunt ascunse, nu șterse. Citirea emailurilor pe țintă și anularea legăturii verifică același acces. Revocarea dreptului este aplicată la următoarea cerere, inclusiv în sesiunea existentă. Metadatele istorice `source_*` din corpul emailului nu sunt auditate de această etapă.

Verificări: 44 teste și 22 scenarii HTTP/recitire în JSON temporar, inclusiv ținte străine/inexistente, task propriu, acces Contracte, metadate falsificate, peste 80 de documente, ID/UUID și revocare în sesiune. Ramura SQL este verificată cu executor simulat, fără integrare SQL live. Nu trimite email/Meta și nu schimbă schema sau drepturile persistate.
