# Acces privat operator.infraflow.ro

Adresă confirmată explicit de utilizator: `https://operator.infraflow.ro`.
Nu se schimbă demo.infraflow.ro, SQL, firewall sau serviciul ERP.
Emailul autorizat în Access rămâne de precizat. Nicio configurație Cloudflare
nu a fost aplicată de agent și interfața HTTP nouă nu este instalată pe VPS.

## Ordine obligatorie

1. În Cloudflare Zero Trust → Access controls → Applications, creează o aplicație
   self-hosted pentru întreg hostname-ul operator.infraflow.ro, fără limită de
   path. Nume recomandat InfraFlow Operator. Sesiune Access propusă: 1 oră.
2. Configurează metoda One-time PIN dacă nu există deja sau IdP-ul personal
   autorizat. OTP Cloudflare este diferit de codul TOTP al operatorului.
3. Politică Allow: Include → Emails → adresa EXACTĂ confirmată. Nu Everyone,
   nu întreg domeniul de email, nu Bypass. OTP nu se pune singur ca Include.
4. Salvează aplicația și identifică AUD/team pentru validarea Access; nu distribui
   tokenuri de tunel, secrete, parole sau coduri în chat/capturi.
5. Abia după verificarea aplicației Access, adaugă public hostname nou în tunelul
   existent, operator.infraflow.ro → http://127.0.0.1:4280, fără path. Ruta demo
   rămâne neatinsă. Activează Protect with Access pentru aplicația corectă în
   setările cloudflared/tunelului; trebuie verificat concret în interfața contului.
   Dacă validarea tokenului nu poate fi confirmată, nu continuăm expunerea.
6. HTTP al aplicației se activează separat, în release nou și numai cu confirmare
   de restart a serviciului privat. Nu se schimbă unitatea ERP. Configurația
   non-secretă necesară este cea de mai jos; nu se aplică manual înaintea pachetului.
7. Test real: browser neautentificat blocat/trimis către Access; email nepermis
   refuzat; email autorizat trece Access, apoi aplicația cere parolă și TOTP.
   Verifică login, reload, logout și acces după logout. Nu presupune că butonul
   logout InfraFlow închide și sesiunea Cloudflare Access: sunt sesiuni distincte.
8. Verifică prin tunel antetele Host original și X-Forwarded-Proto=https, fără a
   afișa Cookie, Authorization sau Cf-Access-Jwt-Assertion. Nu seta Host intern
   127.0.0.1 în configurarea originului; aplicația cere Host exact al domeniului.

## Configurație HTTP pregătită local (opt-in)

```ini
Environment=INFRAFLOW_DEMO_PLATFORM_HTTP=1
Environment=INFRAFLOW_DEMO_PLATFORM_ORIGIN=https://operator.infraflow.ro
Environment=INFRAFLOW_DEMO_PLATFORM_PROXY=loopback-https
```

Este obligatoriu runtime-ul operator activ. Configurație parțială, HTTP origin
sau mod proxy necunoscut refuză pornirea; fără cele trei setări, HTTP rămâne oprit.
Listenerul rămâne exclusiv 127.0.0.1:4280. Încrederea în proxy se acordă numai
conexiunilor loopback și protocolului https exact; alte antete forwarded nu sunt
folosite ca autorizare. Încrederea criptografică în Access se validează în
cloudflared, nu prin simpla prezență a unui antet trimis de client.

Ruta browserului este `/operator`, nu pagina `/` a ERP. Documentul login permite
navigarea din redirectul IdP; excepția nu permite acces cross-site la API-uri.
Readiness global rămâne 503, deoarece provisioning-ul pentru companii nu există.

## Surse oficiale consultate

- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/

Cloudflare recomandă aplicația Access înaintea rutei și validarea tokenului la
origine, inclusiv opțiunea Protect with Access din cloudflared. Configurația
efectivă a contului și testul HTTPS pe VPS rămân de confirmat.

## Confirmări primite și pachet HTTP

Utilizatorul a confirmat bryantneamt@gmail.com. Capturile arată aplicația operator
pentru hostname-ul ales, politica Allow cu Emails exact, One-time PIN disponibil,
Protect with Access pornit, Team name noisy-mouse-4240 și AUD completat din
aplicație. După rezolvarea cache-ului DNS al routerului, utilizatorul a primit
codul Access, l-a introdus și a ajuns la răspunsul platformei not_found. Acesta
confirmă traseul autorizat, nu înlocuiește testul negativ cu identitate nepermisă.

Instalator nou `install-demo-platform-operator-http.py`, două flag-uri explicite:
`--install-confirmed --access-protection-confirmed`. Creează release operator-http-v1
și DOAR drop-in 40-operator-http.conf; păstrează 20/30 și credentialele existente.
Refuză ținte existente și alt release activ decât operator-runtime-v2. Repornește
doar infraflow-demo-platform. La eșec după crearea drop-in-ului, îl elimină doar pe
acela și verifică restaurarea runtime/operator + SQL reader. Release-ul rămâne.

Nu se rulează npm, nu se schimbă schema/granturi, nu se cer parole sau TOTP.
Health checks nu creează sesiuni și nu consumă încercări. Verificarea HTTP locală
simulează Host/protocolul proxy, nu validează Cloudflare end-to-end. După instalare
urmează autentificarea reală în browser, reload, logout și testele Access negative.
Acceptanță locală: 31/31 Node, 4/4 Python (config/fișiere/rollback/scope).
