# UPDATE 091 - Hotfix update UI complet

Versiune: 2.12.71
Data: 2026-06-20

## Problema
- Update-urile rapide 2.12.69/2.12.70 au inclus sursele React, dar aplicatia instalata serveste build-ul din `client/dist`.
- Din acest motiv, modificarile vizuale si CSS-ul de overflow nu ajungeau efectiv in browser dupa restart.
- In dashboard, un text lung din audit putea forta latimea cardului "Activitate recenta".

## Rezolvare
- Pachetul ZIP 2.12.71 este construit in format complet pentru updaterul curent: `server/`, `client/dist/`, `db/`, `scripts/`, `version.json`.
- Am ajustat randurile din "Activitate recenta" sa ramana in latimea cardului.
- Pastrez si protectia globala impotriva overflow-ului orizontal introdusa in 2.12.70.

## Verificare
- Build frontend rulat cu succes.
- Verificare sintaxa server rulata cu succes.
- Arhiva ZIP include build-ul `client/dist`.
