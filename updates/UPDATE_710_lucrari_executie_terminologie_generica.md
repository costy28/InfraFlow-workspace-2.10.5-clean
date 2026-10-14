# UPDATE 710 — Terminologie generică în Lucrări / Execuție

Versiune: **2.12.690**  
Data: **13 octombrie 2026**

## Scop

Eliminarea din interfață a terminologiei rămase din aplicația orientată către
asfaltare, fără pierderea datelor existente și fără ruperea compatibilității API.

## Modificări

- `Consum asfalt` devine `Materiale utilizate`;
- straturile rutiere sunt prezentate ca etape inițială, intermediară și finală;
- câmpurile specifice sunt prezentate generic: temperatură material, cantitate
  utilizată, sector/zonă și responsabil execuție;
- raportul printabil și indicatorii folosesc aceeași terminologie neutră;
- endpointul intern `/asternere/consum-asfalt` rămâne neschimbat pentru
  compatibilitatea instalărilor existente.

## Compatibilitate

- nu se modifică schema sau valorile salvate;
- datele existente continuă să fie citite;
- nu se schimbă permisiunile modulului;
- schimbarea este exclusiv de prezentare și documentare internă.

## Validare

- test automat pentru absența terminologiei vechi din interfață;
- test de compatibilitate pentru endpointul legacy;
- build React/Vite, release check și pachete Windows/Linux.
