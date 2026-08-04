# UPDATE 490 — Editor workflow responsive și audit configurare

Versiune: `2.12.470`
Data: `2026-08-04`

## Context

Editorul fluxurilor configurabile din Setări era prea lat pentru fereastra normală a aplicației desktop. Utilizatorul trebuia să deschidă browserul și să micșoreze zoom-ul ca să vadă complet coloanele de condiții și acțiuni.

## Implementare

- Editorul de pași workflow a fost refăcut din tabel lat în carduri responsive.
- Fiecare pas afișează clar:
  - nume pas;
  - cine aprobă;
  - referință/rol/departament/utilizator;
  - termen;
  - obligație;
  - condiție afișată;
  - builder `condition_rule`.
- Panoul informativ din stânga este `self-start`, deci nu se mai întinde pe înălțimea listei de fluxuri.
- Zona fluxurilor folosește containere `min-w-0`, ca să nu forțeze overflow orizontal.
- A fost adăugat un mini-audit de configurare:
  - ultima salvare;
  - număr fluxuri;
  - număr pași;
  - explicația că documentele lansate păstrează snapshot-ul istoric.

## Siguranță

- Nu există migrare DB.
- Nu există endpoint nou.
- Salvarea fluxurilor rămâne explicită prin butonul `Salvează fluxurile`.

## Verificare

- Build frontend.
- Release check.
- ZIP update validat.
