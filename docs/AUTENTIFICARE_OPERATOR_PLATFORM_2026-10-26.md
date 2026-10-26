# Operator platformă separat — nucleu local

Decizie utilizator: cont dedicat platformei cu parolă și TOTP, independent de
conturile ERP și SQL. Increment local, fără cont creat pe VPS, fără endpoint
public, fără credențiale SQL de writer legate de operator.

## Implementare

server/demo-platform/operator-credentials.js folosește scrypt asincron cu salt
aleator de 16 bytes, hash de 32 bytes, N=32768/r=8/p=3, maxmem=64MiB. Parametrii
urmează configurația de 32MiB din OWASP Password Storage Cheat Sheet:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
Nu reutilizează hashuri sau conturi ERP. Parole 16 caractere Unicode minimum,
1024 bytes maximum, fără control chars. Nu face normalizare tacită.

TOTP HMAC-SHA1, 6 cifre, pas 30 secunde, numai pasul curent și precedent.
Secret canonic Base32 de 20 bytes; comparație timingSafeEqual. Counterul
acceptat trebuie revendicat atomic în store, pentru refuzul reutilizării,
conform RFC 6238: https://www.rfc-editor.org/rfc/rfc6238.html#section-5.2
Test pe vectorul RFC de 59 secunde, trunchiat la 6 cifre, trecut. Nu copiază
funcțiile ERP cu toleranță diferită și nu importă baza/sesiunile ERP.

operator-auth.js cere porturile readOperator/reserveAttempt/claimTotpCounter/
appendAudit, fără fallback local pentru bugetul încercărilor sau counter.
readOperator returnează record cu revizie, hash, secret accesibil validării și
scopes explicite. Adapterul de storage nu există încă; în teste e fake.
Nu se stochează secretul TOTP în clar într-un fișier prin acest increment.

Autentificarea este un singur pas intern parolă+TOTP, nu două rute cu challenge
parțial. Buget propus 5 încercări/15 minute, consumat prin store înainte de
verificarea parolei. Un singur hash în curs per instanță; sesiuni maximum 8,
token de 32 bytes păstrat numai ca SHA256, 4 ore absolute și 15 minute idle.
Restartul invalidează sesiunile volatile. Nu sunt încă cookie-uri browser.
Acțiunile diferite de citire cer CSRF token propriu. Scopes separate read/queue/
activate/session-own. Revizia/operatorul sunt recitite și după audit asincron;
revocarea sau eroarea de store/audit refuză accesul. Eroare publică generică,
fără hashuri, secret, coduri OTP sau tokenuri în evenimente.

## Probe și limite

7 teste auth și 11 regresii: 18/18 trecute, zero skip. Probe hash/salt, vector
TOTP, replay între două instanțe care partajează fake-store, scopes/CSRF/logout,
expirare idle, shutdown, buget încercări comun fake-store și revocare în audit.
Nu sunt probe de stocare durabilă, restart OS, SQL distribuit sau browser.
Auditul expunerilor a fost rulat separat; nu este audit de securitate complet.

Nu există încă adaptor criptat/persistent, înrolare și confirmare TOTP, coduri
de recuperare/reset offline, jurnal pentru toate încercările respinse, UI,
cookie Secure/HttpOnly/SameSite, validare Origin/Host/proxy/TLS, protecție abuz
distribuită sau integrare writer. Nucleul nu este montat în service.js și nu
este o autorizare de a expune portul public sau operațiile SQL.

Următorul increment: proiectare și implementare storage operator/counter/buget/
audit cu persistență atomică și protecția cheii; apoi CLI de înrolare controlată,
probe reale și abia apoi rutele/browserul. Fără update VPS în această etapă.
