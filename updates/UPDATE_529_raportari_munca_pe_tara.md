# UPDATE 529 — Raportări oficiale muncă pe profil de țară

Versiune: `2.12.509`
Data: `2026-08-20`

## Ce s-a schimbat

- `server/shared/countryRules.js` include acum profil pentru registrul oficial al salariaților în regulile HR pe țară.
- România declară explicit adaptorul local `REGES-Online`, separat de exportul intern de lucru existent.
- Profilurile non-RO rămân generice și nu primesc REGES/Revisal ca regulă globală.
- Setările organizației afișează în `Profil internațional` o secțiune nouă: `Raportare muncă`.
- Documentele HR folosesc formulare neutre internațional pentru obligațiile locale.
- Testul HR verifică faptul că REGES este adaptor pe țară, nu regulă globală.

## De ce

InfraFlow trebuie să poată rula internațional. România are REGES-Online, dar alte țări pot avea API-uri, fișiere, portaluri sau proceduri complet diferite. De aceea, HR-ul trebuie să vorbească generic despre raportări oficiale de muncă, iar adaptorul concret să vină din profilul țării.

## Impact

- Direcția REGES rămâne clară pentru România.
- Interfața și documentele HR nu mai presupun că toate organizațiile folosesc REGES.
- Nu necesită migrare SQL nouă.
