# UPDATE 013 - Hotfix installer si autentificare

Versiune: `2.11.3`

## Probleme rezolvate

- Installerul server folosea accidental seed-ul PUBLISERV, cu setup finalizat si parole hash-uite.
- O instalare noua ramanea pe pagina de login in loc sa porneasca wizard-ul initial.
- Endpoint-ul modern nu expunea finalizarea wizard-ului inainte de autentificare.
- Un raspuns `401` la login reincarca pagina si ascundea mesajul de eroare.

## Modificari

- Adaugat `data/app-db.install.json`, seed minim pentru instalari curate.
- Installerul server copiaza seed-ul curat numai daca `data/app-db.json` nu exista.
- Adaugat `POST /api/setup/complete` in routerul modern, permis numai din reteaua interna.
- Login-ul este blocat explicit pana la finalizarea configurarii initiale.
- Clientul nu mai redirectioneaza din interceptor pentru raspunsul `401` al cererii `/login`.

## Compatibilitate

Upgrade-urile existente isi pastreaza baza de date. Seed-ul curat se aplica numai instalarii initiale.
