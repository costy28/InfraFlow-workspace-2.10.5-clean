# Activare formular operator — pregătire pachet

## Precondiții confirmate VPS

- 005: OPERATOR_QUEUE_AUDIT_APPLIED.
- Grant registrar: REGISTRAR_OPERATOR_SCOPE_APPLIED și verificare sub login real.
- Credential: REGISTRAR_CREDENTIAL_SQL_OK, REGISTRAR_SECRET_PREPARED,
  NO_RESTART_NO_COMPANY_CREATED. Parola existentă nu a fost schimbată.
- UI curentă operator-http-v2, listă goală funcțională, Access/HTTPS funcționale.

## Activare limitată

Release nou operator-registration-v1, drop-in nou 42-operator-registration.conf.
Păstrează toate release-urile, configurațiile 20/30/40/41 și credentialele existente.
LoadCredential livrează registrar-password din fișierul root-only pregătit anterior.
Env INFRAFLOW_DEMO_PLATFORM_REGISTRAR=1 este opt-in; fără HTTP configurat sau cu
valoare necunoscută pornirea este refuzată. Fără acest flag comportamentul de
consultare rămâne neschimbat. Activatorul nu este conectat la serviciu.

Serviciul pregătește registrar.check() înainte de listener; numai metadate SQL.
Noul health /health/registrar folosește tot check(), nu queue(). Shutdown închide
și pool-ul registrarului. Erorile health nu afișează mesaje brute de driver.

Instalatorul cere --install-confirmed --registration-ui-confirmed, verifică release
activ operator-http-v2 și metadatele secretului root:root/0600. Nu cere parole,
nu schimbă schema/granturi și nu execută nicio procedură de comandă. Repornește
numai infraflow-demo-platform; ERP-ul și Cloudflare rămân nemodificate.

Acceptanță automată: health registrar/operator/SQL, HTML/asset-uri, refuz 401 fără
sesiune, GET pe ruta de înregistrare refuzat 405 (ruta există, dar cere POST),
readiness global încă 503. Niciun POST de înregistrare în instalator. Dacă eșuează
după activare, înlătură numai 42 și verifică revenirea la UI de consultare HTTP v2.

## După instalare

1. Login proaspăt (restartul închide sesiunile în memorie).
2. Confirmare că formularul este vizibil pentru infraop cu scope trial:queue.
3. Nu se completează/trimit date încă. Prima companie necesită confirmare separată
   cu referință de aprobare și denumire stabilite explicit.
4. Acțiunea adaugă exclusiv rând queued în registru și auditul atomic, nu creează
   baza demo, runtime, fișiere, invitații sau conturi; nu începe cele 15 zile.

Pachetul nu include parola/cheia și nu se folosește pentru instalări client ERP.
