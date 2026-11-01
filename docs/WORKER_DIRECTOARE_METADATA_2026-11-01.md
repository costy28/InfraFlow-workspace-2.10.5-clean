# Worker cinci RPC — checker separat, numai metadate

Nu este încă transportul operațional pentru pregătirea directoarelor.
Checkerul expune numai check/shutdown. SQL fix: identitatea, drepturile server,
bază și obiecte în platform/operator_security. Nu execută RPC și nu citește
înregistrările joburilor. Cere exact cele cinci drepturi aprobate.

Sursă existentă, nemodificată: /etc/infraflow-demo-platform/lease-sql.password,
root:root 0600, fișier normal cu un singur link. Nu se afișează conținutul.
Systemd îl livrează ca worker-directory-sql-password unui DynamicUser temporar.

Destinație nouă: /opt/infraflow-demo-platform/releases/worker-directory-check-v1.
Unitate: infraflow-demo-worker-directory-check.service.
Identitate temporară: infraflow-worker-dir-check. Toate trebuie să fie absente.
Părinții sunt verificați root-owned, fără scriere group/other și fără symlink.
Driverul MSSQL existent este reutilizat, fără npm install.

Moduri separate, ambele root Linux:

1. --preflight-only: metadate OS și node --check, fără SQL, citire parolă sau scrieri.
2. --stage-and-probe-confirmed: pregătește codul root și lansează o singură probă
   systemd tranzitorie; rețea numai localhost, fără capabilități, RuntimeMaxSec30.

Nu schimbă parola, granturi, brokerii vechi, unitățile permanente sau ERP.
Nu preia lease, nu creează job/directoare/rezultate. Eșecul păstrează codul
pregătit pentru verificare, fără reluare sau ștergere automată.

Verificări locale: cinci teste Node, inclusiv refuz pentru patru/extra/duplicate
RPC, golire buffer și shutdown; node --check și compilare Python. Proba reală
SQL/systemd pe VPS este separată și nu este presupusă trecută.
