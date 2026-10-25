# Rutare Demo — decizie fail-closed în test

25 octombrie 2026 · Sursă 2.12.736 · Nu este reverse proxy de producție.

## Implementare

`scripts/lib/demo-gateway-route.js` rezolvă hostname → trial → runtimeKey numai
din snapshotul registrului și legările de rutare furnizate de serviciu. Nu
primește port, bază, URL sau cale de runtime de la client și nu deschide sockets,
DNS, procese sau conexiuni SQL. Funcția cere NODE_ENV=test și întoarce explicit
executionAllowed=false/productionReady=false.

Hostname ASCII strict, normalizat lowercase; fără port, trailing dot, userinfo,
cale sau whitespace. Legare unică pe host/trial, runtimeKey identic cu resursa
trialului și revizie egală cu registrul. Legare duplicată/nevalidă ori revizie
veche blochează rezolvarea; nu există fallback spre un Demo comun.

Acces numai pentru starea active, de la activatedAt inclusiv până înainte de
expiresAt. Termenul este verificat din ceasul serviciului, chiar dacă lifecycle-ul
nu a schimbat încă starea active în expired. Toate celelalte stări sunt refuzate.
Acest resolver nu oferă încă fluxul de invitație/activare: acela necesită contract
separat, nu acces general pentru awaiting_activation.

`server/tests/support/demo-gateway-route-harness.js` expune numai GET /route-probe
pe loopback/port efemer în teste. Returnează decizia JSON, **nu transmite trafic**
la runtime. Cere exact un Host; refuză Host duplicat, Forwarded/X-Forwarded-* și
orice query/selector. În caz de registru/legare indisponibilă produce 503, iar
necunoscut/expirat produce același 404. Nu expune erorile interne. Fără endpoint
montat în app.js, serviciu instalat sau schimbare DNS/Cloudflare.

## Probe și limite

`server/tests/demo-gateway-route.test.js`: 7 probe, cu host A/B distinct, expirare
exactă, host necunoscut, stări neactive, legări greșite/duplicate/vechi, selectors,
antete forward spoofing, Host duplicat prin HTTP real și eroare de snapshot.
Registrul nu este modificat de rezolvare. Regresia modelului trial: alte 7 probe.

Rulare: `node --test server/tests/demo-gateway-route.test.js server/tests/demo-trial-registry.test.js`

Rezultat: **14/14 probe trecute, zero skip**. Audit expuneri: 505 fișiere,
zero constatări; diff check trecut. SQL, Chrome, ACL Windows și ERP complet nu
sunt declarate rerulate prin aceste probe.

Nu validează proxy real, TLS, DNS, SNI, WebSocket, upload/download, cookie/sesiune
cross-instance ori izolarea rețelei. Host este intrare de rutare, nu identitate
autentificată a utilizatorului. Snapshotul este de test, fără garanție de refresh
distribuit sau revocare atomică pe durata unui stream. Antetele forwarded sunt
refuzate în harness, nu configurate pentru un reverse proxy de încredere real.

Următorul increment: legarea deciziei de două runtime-uri HTTP sintetice distincte,
cu destinații definite server-side și refuz înainte de conectare pentru host sau
stare neeligibilă. Nu se folosește o adresă de destinație din cererea clientului.
Pilotul public rămâne NO-GO; versiunea/arhivele și instanțele instalate sunt neatinse.
