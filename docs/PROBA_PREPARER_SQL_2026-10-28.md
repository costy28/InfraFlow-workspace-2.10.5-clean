# Probă nativă pentru identitatea SQL de solicitare

Script: scripts/probe-demo-preparer-driver.cjs.
Confirmări necesare: NODE_ENV=test și --temporary-db-confirmed.

Proba creează numai o bază sintetică locală INFRAFLOW_TEST_TRIALS și un login
aleator INFRAFLOW_TEST_PREPARER. Parola este generată în memorie și nu se afișează.
Nu folosește conturi ERP, nu se conectează la VPS, nu instalează fișiere systemd.

Verificări:
1. Migrările până la 009 într-o bază nouă; nicio schemă ERP modificată.
2. Scriptul de drepturi refuză baza greșită și o identitate cu rol db_datareader.
3. Aplicarea/reaplicarea scriptului pe loginul temporar fără roluri largi.
4. Login nativ prin driver MSSQL, fără sysadmin sau CONTROL DATABASE.
5. Drepturile private vizibile conțin exclusiv EXECUTE pe request_provision_job.
6. Refuz efectiv SELECT date/conturi, lease, activare, queue și acordare scope.
7. Procedura refuză operatorul fără scope și cu revizie veche.
8. Clientul de solicitare apelează RPC parametrizat; repetarea aceleiași cereri
   păstrează același job/receipt, iar alt commandId pentru același trial este refuzat.
9. Exact un job, șapte rezervări și un audit corelat cu loginul SQL; trial-ul rămâne
   queued, cu datele activării/expirării NULL și executionAllowed=false.
10. Pool închis, login temporar șters și absență verificată; apoi baza eliminată.

Driverul folosește în fixture numele aleatoare și portul local SQL Express.
Nu se schimbă ținta fixă a transportului de producție. Proba nu dovedește instalarea
loginului infraflow_demo_preparer sau credențialei pe VPS și nu închide acceptanța
HTTP/operator, care necesită teste reale ulterioare.

Rezultat confirmat: 10 grupuri trecute, passed=true, cleanup=true.
Baza INFRAFLOW_TEST_TRIALS_B55AFAB73137 și loginul temporar au fost eliminate.
112 teste Node trecute și zero constatări în auditul fișierelor.
Driverul a emis avertismentul TLS DEP0123 pentru ServerName cu IP, fără eșec de
conectare; avertismentul nu este rezolvat de această probă.
