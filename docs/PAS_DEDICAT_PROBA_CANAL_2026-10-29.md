# Pas dedicat probei canalului — evitarea blocării instalării reale

Jurnalul 010 refuză intenția unui pas dintr-o generație anterioară fără reconciliere.
Folosirea os_identity pentru proba canalului pe jobul pilot ar ocupa acel pas și
ar bloca ulterior crearea reală. Nu ștergem intenția și nu slăbim regula de fencing.

Migrarea 013 adaugă exclusiv channel_review_probe la lista de nume acceptate de
jurnal. Acesta nu este un pas de creare resurse. Cele șapte nume reale rămân
separate, iar testul ulterior poate folosi os_identity într-o generație nouă.
Proba dedicată nu este relansată automat pe același job dacă există deja o intenție
într-o generație veche. Starea intent_recorded și gate-ul execution_ready=0 rămân.

Aplicarea cere baseline 012 și niciun job leased. Compară forma canonică a vechii
constrângeri cu una generată de același motor într-un tabel temporar; la diferență
se oprește. Modifică strict whitelist-ul procedurii numai dacă găsește exact
forma așteptată, prin ALTER (fără drop/recreate de procedură). Nicio resursă tenant,
grant, parolă, intenție sau bilet nu este creată de migrare. Tranzacție + applock.

Parserul Node al biletelor și receptorul Python recunosc pasul nou numai în
receipt-uri executionAllowed=false. Aceste fișiere sunt pentru release-ul viitor
al canalului; nu suprascriu codul instalat și nu cer restart acum.

Înainte de rularea completă: preflight, backup și confirmare separată pentru 013.
Executarea probei pe jobul real rămâne altă confirmare, după montarea canalului.

## Rezultate locale

151 teste Node, 9 teste Python pentru protocol, audit 613 fișiere fără constatări.
Prima probă nativă INFRAFLOW_TEST_TRIALS_64EEFBACF92D: passed=true/cleanup=true.
Extensia INFRAFLOW_TEST_TRIALS_25835590881D: opt grupuri trecute, passed=true și
cleanup=true. Granturile acordate înainte de ALTER au rămas funcționale; un bilet
channel_review_probe a fost emis și consumat cu executionAllowed=false. După
eliberare și preluare cu generație nouă, os_identity a putut fi înregistrat.
Pasul necunoscut și reluarea probei vechi nereconciliate au fost refuzate.
Nu s-au creat resurse OS/tenant în aceste teste; bazele temporare au fost eliminate.

Arhiva schemei conține numai 013, preflight read-only, backup separat și acest
document. Nu include instalatorul canalului sau operații de job și nu acordă
drepturi noi. Aplicarea 013 cere backup verificat și acord separat pe VPS.

## Confirmare VPS

Utilizatorul a confirmat aplicarea 013 după backup-ul verificat:
`/var/opt/mssql/data/INFRAFLOW_DEMO_PLATFORM_pre013_E384007F12D84792B2741D7B29251BCA.bak`.
Rezultat: CHANNEL_REVIEW_PROBE_APPLIED. Verificarea ulterioară a arătat
013_channel_review_probe_v1, job queued/revizie 3/generație 1/execution_ready 0,
fără lease, zero intenții și zero bilete. Nicio probă de canal executată pe VPS.
