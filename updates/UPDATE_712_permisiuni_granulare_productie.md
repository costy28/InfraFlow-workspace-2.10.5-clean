# UPDATE 712 — Permisiuni granulare Producție / Operațiuni

Versiune: **2.12.692**  
Data: **13 octombrie 2026**

## Scop

Alinierea interfeței modulului Producție / Operațiuni cu permisiunile granulare
deja aplicate de API.

## Modificări

- filele Consumuri, Rețete, Planuri și Raport zilnic sunt filtrate prin
  permisiunile punctuale;
- încărcarea inițială evită API-urile secțiunilor fără acces;
- crearea consumurilor necesită `consumptions:create`;
- exporturile necesită `consumptions:export`;
- legarea consumurilor cu Gestiune este vizibilă numai pentru utilizatorii cu
  drept de creare consum sau mișcare de stoc;
- ghidul de flux afișează numai pașii accesibili;
- cantitățile produse au etichete generice, fără unitate industrială impusă.

## Compatibilitate

- endpointurile și câmpurile interne existente rămân neschimbate;
- datele și rapoartele istorice rămân compatibile;
- protecția backend existentă rămâne autoritatea finală.

## Validare

- teste dedicate pentru file, acțiuni și încărcări API;
- regresii generale de permisiuni;
- build React/Vite;
- audit expunere fișiere și release check.
