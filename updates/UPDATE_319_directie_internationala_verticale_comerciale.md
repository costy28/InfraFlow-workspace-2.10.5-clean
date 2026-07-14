# UPDATE 319 — Direcție internațională și verticale comerciale

Versiune: `2.12.299`  
Data: `2026-07-14`

## Scop

Fixarea în documentația de produs a direcției comerciale internaționale: InfraFlow trebuie să poată funcționa în timp pe limbă, țară și legislație selectată, nu doar ca ERP românesc generalizat.

## Modificări

- Actualizat `docs/PRODUCTIZARE_COMERCIALA.md`:
  - direcție multi-country;
  - profil de țară pentru limbă, monedă, formate, nomenclatoare, documente și reguli legislative;
  - pachete comerciale noi: Warehouse/WMS, Logistics, Public Health/Ecarisaj.
- Actualizat `AGENTS.md`:
  - direcție internațională activă;
  - regula ca legislația nouă să fie proiectată ca extensibilă pe profil de țară;
  - backlog pentru Warehouse/WMS, Logistics și Ecarisaj/Public Health Services;
  - Multi-limbă extins în Multi-limbă + profil de țară.
- Aliniat `server/package.json` și `server/package-lock.json` la versiunea curentă.

## Compatibilitate

- Nu au fost schimbate endpointuri.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Update-ul este de direcție/produs și versionare, fără schimbare de comportament runtime.

## Următor pas recomandat

Implementare tehnică incrementală:

1. câmpuri `locale`, `country`, `currency` în setările organizației;
2. registry intern de țări și limbi;
3. separare traduceri UI de reguli legislative;
4. pregătire template-uri documente pe limbă/jurisdicție.
