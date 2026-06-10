# UPDATE 044 - Start Demo si profil Publiserv

## Scop

Transforma demo-ul intr-o intrare prezentabila comercial, cu pagina publica de pornire, conturi explicite si date fictive apropiate de contextul Publiserv.

## Inclus

- Pagina publica `/start-demo` cu patru intrari: Director, Sef Mecanizare, Sofer Kiosk si Admin Demo.
- Ruta `/` deschide Start Demo in modul demo, iar in afara demo-ului revine spre dashboard.
- Autentificare rapida din Start Demo pentru conturile ERP.
- Mod prezentare activat din Start Demo, cu bara de pasi in aplicatie.
- Link `Deschide Start Demo` pe pagina de login.
- Profil demo redenumit in `PUBLISERV DEMO SA`, cu CUI si date fictive.
- Smoke test extins pentru Start Demo si compania demo.

## Note

- Datele raman fictive si nu folosesc date reale Publiserv.
- Instanta demo ramane pe `DB_MODE=json` si portul `4190`.
- Instanta MSSQL de dezvoltare nu este modificata.
