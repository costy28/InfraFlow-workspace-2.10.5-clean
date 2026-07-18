# UPDATE 332 — Release check integrat în pachetarea ZIP

Versiune: `2.12.312`  
Data: `2026-07-18`

## Ce s-a schimbat

- `scripts/windows/build-update-zip.ps1` rulează automat:
  - `npm run release:check -- --no-zip` înainte de arhivare;
  - `npm run release:check` după generarea ZIP-ului.
- A fost adăugată opțiunea `-SkipReleaseCheck` pentru diagnostic manual controlat.
- Dacă versiunile, documentația, nota UPDATE sau arhiva finală sunt incoerente, pachetarea se oprește cu eroare.

## Motiv

Release check-ul din UPDATE 331 era bun, dar putea fi uitat. Acum verificarea este parte din procesul de pachetare, deci fiecare ZIP produs trece automat prin aceleași controale.

## Validare

- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run audit:local`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-update-zip.ps1 -SkipClientBuild`
