# Credentiala existentă SQL a adaptorului — pregătire și probă metadata

Loginul infraflow_demo_adapter_review a fost creat și verificat pe VPS, iar
identitatea OS este 993:984. Acest pachet NU schimbă parola sau granturile SQL.
Nu conține creatorul de login ori migrări și nu creează/consumă bilete.

Ținte noi, exclusive:
- /etc/infraflow-demo-platform/adapter-review.password — root:root 0600;
- /opt/infraflow-demo-platform/releases/adapter-sql-check-v1 — cod root-owned;
- infraflow-demo-adapter-sql-check.service — numai unitate tranzitorie proprie.

Preflight refuză fișier/release/unitate existente, symlink sau părinte nesigur.
La orice stare parțială nu se reia automat și nu se șterge nimic pentru a ascunde
eroarea. Fără npm/install și fără drepturi noi; driverul existent este reutilizat
read-only printr-o legătură root-owned către sql-reader-v1/node_modules.

Utilizatorul introduce parola SQL EXISTENTĂ a adaptorului de două ori. Nu parola
SA/operator/worker și nu se afișează în chat. După copierea codului de probă,
autentificarea și metadatele sunt verificate sub UID993 cu parola pe stdin privat,
înainte de salvarea fișierului de credențială. /usr/sbin/runuser are cale absolută.
Parolă greșită poate lăsa codul de probă pentru review, dar nu salvează un fișier
de parolă neverificat. Nu există retry automat sau reset de parolă.

Apoi root scrie fișierul exclusiv 0600 și systemd îl livrează prin LoadCredential
la unitatea tranzitorie User/Group adaptor. Node verifică metadata credentialei,
identitatea SQL și exact cele două EXECUTE, fără apel la operațiile comerciale.
Bufferul temporar este suprascris după folosire; nu promitem ștergerea sigură a
șirurilor JS/Python sau a memoriei interne a driverului.

La succes: ADAPTER_REVIEW_CREDENTIAL_SQL_OK, ADAPTER_REVIEW_SECRET_PREPARED,
NO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART. Nu pornește canalul Unix permanent
și nu repornește ERP/platforma. Proba completă a biletului se montează separat.
Înainte de rulare: hash pachet, inventar de căi și confirmare de pregătire.

Confirmare VPS primită după inventar și acord: ADAPTER_REVIEW_CREDENTIAL_SQL_OK,
ADAPTER_REVIEW_SECRET_PREPARED, NO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART.
Credentiala root-only există acum; nu se reia preparatorul. Proba systemd a
confirmat autentificarea și exact cele două drepturi EXECUTE, fără bilete/joburi.
