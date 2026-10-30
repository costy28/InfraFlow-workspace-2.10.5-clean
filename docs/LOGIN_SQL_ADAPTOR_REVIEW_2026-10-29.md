# Login SQL adaptor review — creare separată, numai după confirmare

Țintă fixă: infraflow_demo_adapter_review în INFRAFLOW_DEMO_PLATFORM, după 012.
Login SQL distinct de utilizatorul OS omonim (993:984); cele două identități nu
împart automat parole sau drepturi. Scriptul nu citește secrete existente.

Creatorul cere parola SA și o parolă NOUĂ, distinctă, 16–128 caractere ASCII
imprimabile, confirmată de două ori. Nu folosi parola operatorului, workerului,
registrarului sau SA. Păstrează parola nouă în managerul de parole, nu în chat.
Parolele nu sunt argumente CLI, fișiere sau output; SQLCMDPASSWORD este transmis
numai procesului SQLCMD. Administratorul OS rămâne de încredere, putând inspecta
procesele; nu se promite protecție față de root.

Preflight numai citire refuză target greșit, baseline lipsă, identitate existentă.
CREATE LOGIN/USER și drepturile sunt într-o tranzacție, cu revalidarea absenței.
Nu resetează un login existent și nu încearcă automat să repare o stare parțială.

Permise exclusiv două EXECUTE:
- platform.read_adapter_resource_review
- platform.adapter_review_ticket_command

SELECT/INSERT/UPDATE/DELETE pe platform/operator_security și toate celelalte
proceduri sunt refuzate. Nici sysadmin, db_owner, apartenențe la roluri sau
proprietate asupra schemelor/bazelor. Metadatele efective sunt verificate prin
impersonare administrativă în tranzacție, apoi prin autentificare reală cu loginul
nou. Procedura ticket refuză emiterea dacă apelantul nu deține lease-ul; acest
login nu primește drept să preia lease sau să înregistreze intenții.

Nu se creează fișier de credențială, serviciu sau bilet și nu se modifică jobul.
Niciun drept nou pentru infraflow_demo_lease. La verificare eșuată după creare,
loginul poate exista: nu relua scriptul și nu șterge automat; inspectează starea.

Ordine VPS: hash pachet → inventar login/user numai citire → confirmare separată
de creare → rulare creator → ADAPTER_REVIEW_LOGIN_VERIFIED. Montarea credentialei
systemd și proba end-to-end sunt pași ulteriori, nu efecte ale acestui script.

## Probe locale

4 teste Python trecute, 144 teste Node trecute, audit 609 fișiere fără constatări.
Proba SQL INFRAFLOW_TEST_TRIALS_4C68E5FE7144: nouă grupuri trecute, passed=true,
cleanup=true. SQL generat de creator a fost aplicat în baza sintetică; identitate
existentă refuzată, rol db_datareader accidental refuzat. Verificarea generată a
trecut prin autentificare SQL reală; consultarea rezervărilor a trecut validatorul
local. SELECT direct pe joburi/bilete/operator și procedurile lease/intenții/
activare/scope grant au fost refuzate. Jobul și jurnalul au rămas nemodificate.
Loginul temporar și baza au fost eliminate confirmat. DEP0123 rămâne cunoscut.

Confirmare VPS primită: după inventar LIBER/LIBER și acord separat, utilizatorul
a raportat ADAPTER_REVIEW_LOGIN_VERIFIED, NO_JOB_NO_TICKET_NO_RESTART și nicio
credentială instalată. Loginul dedicat există acum; nu se rulează din nou creatorul.
