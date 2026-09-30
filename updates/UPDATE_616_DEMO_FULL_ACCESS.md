# UPDATE 616 — Demo comercial cu acces complet

Versiune: `v2.12.596`  
Data: `2026-09-30`

## Ce se schimbă

- Instanța comercială MSSQL izolată afișează licența `Demo complet`.
- Toate modulele configurabile sunt active la seed și pot fi reactivate din Setări.
- Comportamentul este activ exclusiv când există simultan profilul `commercial-mssql` și o bază `INFRAFLOW_DEMO*`.

## Siguranță

- Licența unei instalații reale nu este suprascrisă și nu primește acces demo.
- Pachetul nu rulează seed-ul demo automat.

## Verificare

1. Rulează seed-ul numai pentru baza demo izolată.
2. În Setări, dezactivează și reactivează un modul.
3. Confirmă că starea rămâne salvată după reîncărcarea paginii.
