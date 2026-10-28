# Panou Pregătește demo v1 — instalare controlată

Prerechizite confirmate pe VPS: schema 009, runtime operator-prepare-compat-v1,
trial:prepare acordat cu TOTP funcțional, login preparer și secret verificate
prin proba systemd. Loginul lease și workerul nu sunt activate de acest pachet.

## Ordine

1. Transfer și verificare SHA-256. Extragerea nu execută nimic.
2. Verifică serviciile sănătoase, release-ul activ și absența noilor destinații:
   operator-preparation-v1 și 44-operator-preparation.conf.
3. Confirmare separată a restartului privat: sesiunile operator se închid.
4. Rulează instalatorul ca root cu --install-confirmed --platform-restart-confirmed.
5. Confirmă OPERATOR_PREPARATION_UI_INSTALLED, PREPARER_HEALTH_OK, sănătatea operator,
   reader, registrar și NO_JOB_CREATED_BY_INSTALLER.
6. Autentificare HTTPS reală, consultare și verificare buton. NU confirma încă
   solicitarea jobului: prima scriere are o confirmare separată a utilizatorului.
7. După aprobarea explicită, selectează compania de test, verifică UUID/revizie,
   bifează confirmarea și trimite o singură dată. Notează commandId/jobId.
8. Verifică SQL: un job, șapte rezervări, audit corelat; execuție 0 și compania
   queued, neactivată. Nu pornește perioada de 15 zile și nu creează instanța ERP.

## Protecții

Release separat, copierea fișierelor nemodificate din release-ul existent verificat,
patch explicit numai pentru serviciu, autorizare, HTTP/UI și clientul preparer.
Reutilizează dependențele private sql-reader-v1, nu node_modules ERP.
Drop-in nou 44 cu flag opt-in și LoadCredential pentru secretul deja existent.
Nu schimbă parole, conturi, granturi sau secrete. Nu apelează POST prepare în health.

La verificări eșuate după creare drop-in: elimină doar noul fișier, daemon-reload
și restart doar infraflow-demo-platform, apoi verifică release-ul anterior compatibil
cu scope trial:prepare. Release-urile și secretul rămân pentru inspecție.
La eroare nu relua automat; trimite markerii și etapa, nu secrete sau loguri brute.

## Limite

Testele locale de installer sunt simulate; nu înlocuiesc execuția Linux/systemd
și acceptanța Cloudflare/HTTPS pe VPS. Proba HTTP→SQL real folosește baza și loginul
sintetice pentru comanda preparer; stocarea autentificării operatorului este un
fixture în memorie, nu identitatea SQL auth instalată. Testul browserului interceptează
HTTPS local și nu reprezintă validarea certificatului sau politicii Access.
Publicarea oficială și workerul rămân neactivate.

Validare locală: 118 teste Node și 3 teste Python ale instalatorului trecute;
Chrome smoke trecut. Proba nativă cu HTTP a trecut toate cele 14 grupuri, inclusiv
CSRF, actor din sesiune, răspuns pierdut după commit, retry fără duplicate,
logout și revocare după commit. Baza INFRAFLOW_TEST_TRIALS_68C13DD0CE02 și loginul
temporar au fost eliminate confirmat (passed=true, cleanup=true).
Audit fișiere: zero constatări. Avertismentul TLS DEP0123 pentru IP rămâne cunoscut.
