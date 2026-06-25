# UPDATE 142 - Hotfix versiune dupa update

Versiune: 2.12.121 -> 2.12.122
Data: 2026-06-24

## Problema

Pachetele de update se instalau si apareau in istoricul de update-uri, dar cardul "Versiune curenta" putea ramane pe versiunea veche.

## Cauza

Verificarea update-urilor si unele endpoint-uri de sistem foloseau versiunea memorata la pornirea serverului sau doar `server/package.json`, in timp ce pachetul continea mai multe fisiere de versiune.

## Modificari

- Versiunea curenta este citita din `version.json`, apoi din `package.json`, apoi din `server/package.json`.
- Dupa aplicarea unui update se sincronizeaza `version.json`, `package.json`, `server/package.json`, `client/package.json` si `electron/package.json`.
- Cache-ul verificarii de update se golește dupa aplicarea pachetului.
- Endpoint-urile publice de versiune si setup raporteaza versiunea reala din fisiere.

## Verificare

- Update-ul nou trebuie sa fie acceptat peste 2.12.119/2.12.120/2.12.121.
- Dupa restart sau refresh, Setari -> Sistem: Actualizari trebuie sa afiseze versiunea instalata.
