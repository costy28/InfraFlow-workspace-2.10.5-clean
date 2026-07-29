# UPDATE 427 — Confirmări UX Salarizare

Versiune: `2.12.407`  
Data: 29 Iulie 2026

## Scop

Continuă curățarea P0 UX din auditul complet pentru zona Contabilitate / Salarizare. Acțiunile care modifică statul salarial, plățile sau notele contabile nu mai folosesc dialoguri native de browser.

## Modificări

- `client/src/pages/accounting/Salarizare.jsx` folosește `ConfirmDialog` pentru:
  - devalidarea statului salarial;
  - crearea statului rectificativ;
  - înregistrarea plății salariilor;
  - stornarea plății salariale;
  - stornarea notei contabile salariale;
  - înregistrarea obligațiilor bugetare;
  - stornarea obligațiilor bugetare;
  - anularea ajustărilor salariale.
- Acțiunile care cer motiv folosesc câmp dedicat în dialog, cu validare minimă.
- Confirmările pozitive explică impactul în trezorerie și în contabilitate.

## Compatibilitate

- Nu s-au schimbat endpoint-urile backend.
- Payload-urile existente sunt păstrate; la anularea ajustărilor salariale motivul rămâne trimis în același câmp `motiv`, dar poate fi editat de operator.
- Nu există modificări de schemă DB.

## Verificări

- `rg "window\\.(prompt|confirm|alert)" client/src/pages/accounting/Salarizare.jsx` — fără rezultate.
- `npm run build`
- `npm run release:check`
