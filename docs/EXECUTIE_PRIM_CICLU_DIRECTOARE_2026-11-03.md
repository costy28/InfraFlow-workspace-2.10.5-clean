# Primul ciclu SQL directoare — pachet separat

Stare de plecare: job00f612ed-a8ac-4688-a26f-679760eee0be queued/revizie7/
generație3, trialb1100b43-48d0-42fa-8a1d-73b1286f8242 neactivat; identitate
992/983 observată și jurnal OS completat. Backup verificat anterior:
/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre_directory_cycle_62CCF39D4C644A22AFCC0539BAC49C81.bak

Ordine: SHA, --check-only fără SQL/parole/scrieri, confirmare separată,
--apply-confirmed root interactiv. Tastează UUID-ul exact al jobului, apoi
parola SA pentru două verificări numai în citire. Parola nu se salvează și nu
ajunge în argv; root este de încredere. Ciclul folosește lease-sql.password
prin serviciul worker izolat, nu drepturi SA.

Preflight revalidat după pauza interactivă: identitate și jurnal OS, absența
celor opt căi, sursa secret root600, unitate absentă, destinații exclusive,
opt fișiere broker deja instalate cu SHA256 exact și driverul așteptat.

Destinații noi root700:
- /opt/infraflow-demo-platform/releases/directory-cycle-pilot-v1
- /var/lib/infraflow-demo-directory-cycle

Jurnalul per job este creat durabil înainte de pipe/init/claim. Tokenuri numai
în bootstrap root600; nu imprima acest fișier. Nu există resume sau ștergere
automată. Orice director de încercare existent cere review, chiar dacă nu s-a
ajuns la SQL. Nu modifica manual UUID/gen/revizie pentru a forța reluarea.

Succes SQL-only: claim -> intent tenant_directories -> prepare -> release.
Stare așteptată queued/revizie9/generație4, execution_ready0, lease eliberat,
o nouă intenție și o încercare pregătită. Jurnal released cu nouă evenimente.
Verificarea SQL după execuție este separată, nu dedusă numai din mesajul CLI.

Release invalidează contextul live. Încercarea este numai probă/review, NU o
autorizație reutilizabilă pentru creare directoare. Viitoarea execuție OS va
avea un protocol și o confirmare distincte. Nu se creează conturi, directoare
tenant, baze de date sau activare; nu se repornesc ERP/platforma.

La orice rezultat incert: STOP, fără retry/release compensatoriu/restore.
Inspectează starea SQL și jurnalul privat prin proiecția fără secrete.

Teste locale: binding manifest și controale wrapper, compilare Python,
teste broker/client/ciclu. Jurnalul nativ cu SQL simulat a fost validat pe
VPS înaintea acestui pachet. Wrapperul și ciclul SQL real nu sunt încă probate
pe VPS; preflight-ul și rezultatele reale trebuie confirmate separat.
