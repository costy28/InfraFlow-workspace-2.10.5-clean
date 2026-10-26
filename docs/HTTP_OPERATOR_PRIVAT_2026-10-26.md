# HTTP operator — fundație locală, nemontată în serviciu

`operator-http.js` este adaptorul separat pentru motorul de autentificare deja
verificat pe VPS. Nu este importat sau montat de `service.js`; nu se livrează un
pachet de activare în această etapă. Nicio rută nouă nu este expusă pe VPS.

## Contract

- POST `/operator/login`: JSON exact username/password/code, Origin HTTPS identic
  cu originea configurată explicit. Cookie __Host-infraflow_operator, Secure,
  HttpOnly, SameSite=Strict, Path=/, fără Domain. Tokenul de sesiune nu apare în
  JSON; răspunsul oferă tokenul CSRF și expirarea.
- GET `/operator/session`: verifică sesiunea și dreptul trial:read prin motorul
  existent, cu audit înaintea răspunsului. Nu returnează conturi sau date trial.
- POST `/operator/logout`: JSON gol, cookie de sesiune și X-CSRF-Token validat de
  motorul existent; invalidează sesiunea și expiră cookie-ul.
- Sesiuni exclusiv server-side, token hash în memorie; expirările/revocarea și
  limita durabilă SQL a autentificării rămân la motorul existent.

## Protecții

Host exact, Origin exact pe POST, Sec-Fetch-Site cross-site respins, fără CORS.
HTTPS direct sau proxy de loopback declarat explicit; X-Forwarded-Proto nu este
acceptat implicit. X-Forwarded-Host este respins. Antetele sensibile duplicate,
cookie-ul de sesiune duplicat, Content-Encoding și tipurile non-JSON sunt respinse.
Limită 4096 bytes, UTF-8 strict, citire maximum 3 secunde, maximum patru cereri
active. Erori generice, Cache-Control no-store, fără logarea credentialelor.

## Verificare și limite rămase

Teste HTTP pe server temporar local: cookie, CSRF, Host/Origin/HTTPS, input limitat;
test integrat cu motorul real scrypt/TOTP, store de test în memorie: cod reutilizat
refuzat, citire auditată, logout și cookie revocat. Nu echivalează cu SQL real sau
browser HTTPS pe VPS. Testele anterioare pe VPS confirmă separat SQL și runtime.

Înainte de montare: alegerea domeniului privat și restricția de acces la proxy,
validarea antetelor efective Cloudflare/proxy, interfață login și gestionare CSRF
după reîncărcare (nu stocare token sesiune în localStorage), test browser HTTPS,
recuperare TOTP și limitare la nivel de proxy. Nu se activează comenzi comerciale.

## Interfață și reîncărcare — increment local

Interfața statică `/operator`, cu CSS/JS locale și CSP fără scripturi inline,
include formular utilizator/parolă/TOTP, stare sesiune și logout. Nicio comandă
comercială nu este disponibilă. Formularele curăță parola/codul după cerere,
nu există localStorage/sessionStorage și nici retry automat după rezultat incert.

`resume` verifică sesiunea prin motorul existent, cu audit și revocare, apoi
rotește CSRF și returnează doar CSRF/expirare, niciodată tokenul cookie. Logout
reîmprospătează CSRF înaintea POST pentru suport după reload sau alte taburi.
Tokenul CSRF rămâne numai în memoria cererii; cookie-ul rămâne HttpOnly.

Smoke Chrome headless local: login cu motor real scrypt/TOTP și store fixture,
cookie Secure/HttpOnly/Strict inaccesibil document.cookie, câmpuri curățate,
reload cu sesiune păstrată, logout, reload fără sesiune, mobil 390px fără overflow,
zero erori JavaScript. Cererile HTTPS au fost interceptate către server local:
nu este dovadă TLS real, SQL real, Cloudflare sau acces privat pe VPS.
Script reproductibil: scripts/smoke-operator-ui.cjs (Playwright + Chrome).

Serviciul VPS rămâne neschimbat și adaptorul HTTP încă nemontat. Este necesară
alegerea explicită a domeniului privat înainte de configurarea proxy/origin.
