# UPDATE 321 — Registry reguli pe țară

Versiune: `2.12.301`  
Data: `2026-07-14`

## Scop

Separarea primului strat de reguli legislative de profilul organizației. În loc ca modulele să presupună implicit România, aplicația are acum un registry central care descrie regulile disponibile pe țară.

## Modificări

- Backend:
  - modul shared nou `server/shared/countryRules.js`;
  - catalogul de țări este reutilizabil din shared;
  - endpoint read-only `GET /api/settings/country-rules`;
  - profil RO activ pentru HR, fiscal/contabil și documente;
  - profiluri non-RO marcate generic/roadmap până la implementarea regulilor locale.

- Frontend:
  - `Setări > General > Profil internațional` afișează sumarul regulilor active:
    - HR;
    - fiscal/contabil;
    - documente.
  - Pentru țările fără legislație implementată apare avertizare explicită.

- Verificare:
  - smoke suite read-only verifică endpointul `/settings/country-rules`.

## Compatibilitate

- Nu schimbă calculele existente.
- România rămâne profilul implicit și activ.
- Acest update pregătește modulele viitoare pentru reguli locale fără hardcodare pe o singură jurisdicție.
