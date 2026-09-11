# UPDATE 567 — Curățare ieșiri sistem și limbaj tehnic generic

Versiune: 2.12.547
Data: 2026-09-11

## Scop

Continuă desprinderea comercială de urmele istorice vizibile în fișierele exportate și în descrierile modulului Tehnic, fără să schimbăm motorul existent de producție sau compatibilitatea cu datele vechi.

## Modificări

- Backup-urile descărcate din aplicație folosesc nume de fișier `backup-infraflow-...`, fără branding istoric de client pilot.
- Exporturile de diagnostic sistem folosesc nume de fișier `diagnostic-infraflow-...`.
- Restore-ul păstrează compatibilitatea cu backup-urile vechi deja generate.
- Catalogul de module descrie Tehnic ca lucrări, teren și output operațional, nu ca vânzări asfalt implicite.
- Raportul tehnic afișează `Output vândut`, păstrând valorile și calculul existent.

## Verificări

- npm run build
- npm run release:check -- --no-zip
- npm run audit:file-exposure
- git diff --check
- build update ZIP
