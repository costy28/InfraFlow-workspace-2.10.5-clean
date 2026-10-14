# UPDATE 717 — Permisiuni granulare în Parc & Resurse

Versiune: **2.12.697**  
Data: **14 octombrie 2026**

## Modificări

- Catalogul de roluri separă vizualizarea și administrarea parcului, planificărilor, bonurilor de lucru, carburantului, mentenanței și conformității.
- Importurile de carburant, rapoartele și exporturile au drepturi proprii.
- Pagina Parc & Resurse afișează numai filele și acțiunile permise utilizatorului.
- Solicitările au filă proprie pentru utilizatorii cu drept de solicitare sau aprobare.
- Formularele de editare, ștergere, procesare și export rămân închise fără dreptul punctual.
- API-urile aplică aceleași delimitări, inclusiv pentru documente flotă și adaptorul opțional de carburant.

## Compatibilitate

- Nu se schimbă schema bazei de date.
- Rolurile existente cu `mechanization:view` sau `mechanization:manage` continuă să funcționeze.
- Permisiunile granulare pot fi acordate treptat rolurilor noi sau existente.

## Verificări

- teste dedicate Parc & Resurse și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
