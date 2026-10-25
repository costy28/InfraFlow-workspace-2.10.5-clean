# Conector SQL de citire — platforma Demo

Implementat local, neinstalat pe VPS. Baza/loginul au fost create separat de
utilizator; citirea bootstrap-ului a fost confirmată prin sqlcmd, nu prin acest
conector Node. Nu se reexecută bootstrap-ul pentru resurse existente.

## Contract

- server/demo-platform/sql-reader.js: pool privat, țintă fixă 127.0.0.1:1433,
  INFRAFLOW_DEMO_PLATFORM, infraflow_demo_platform; query exclusiv diagnostic.
- Parola: /etc/infraflow-demo-platform/sql-reader.password, fără newline,
  16–128 caractere ASCII. Fișier regular, root:grupul efectiv al serviciului,
  mod exact 0640, un singur hardlink, O_NOFOLLOW, verificare fstat după open.
  Fișierul nu a fost creat prin acest increment. Nu se folosește parola SA.
- Flag explicit INFRAFLOW_DEMO_PLATFORM_SQL=1; fără flag serviciul de bază
  continuă să funcționeze fără SQL. Fără configurare din env ERP.
- GET /health/sql local: 200 numai după verificarea identității, bootstrap-ului,
  drepturilor și refuzului accesului la INFRAFLOW_DEMO. Erorile externe sunt fixe,
  fără stringuri de conexiune ori mesaje ale driverului. Pool 1 conexiune,
  request/connect 5 secunde; cererile simultane împart proba în curs.
- GET /health/ready rămâne 503. Nu este registru lifecycle complet sau worker.
- Shutdown închide listenerul, apoi pool-ul. Nicio rută de scriere SQL.

Folosim sys.fn_my_permissions(NULL,'SERVER') pentru whitelist CONNECT SQL și
VIEW ANY DATABASE. Vechea expresie HAS_PERMS_BY_NAME cu securabil NULL a dat
NULL pe VPS și a oprit verificarea; bootstrap-ul a fost corectat doar în sursă.
Nu reluăm crearea bazei/loginului. VIEW ANY DATABASE divulgă nume, nu date;
reducerea acestei vizibilități este o decizie separată, nu un efect al conectorului.

## Validare și limite

6/6 teste Node trecute: serviciu și conector cu driver simulat, fișier metadate,
drepturi fail-closed, pool partajat la cereri concurente, shutdown, erori mascate.
Audit 530 fișiere, zero constatări. Testele Python ale bootstrap-ului nu au fost
rerulate: python indisponibil în terminalul acestei etape. Nu se declară probă
SQL Node reală pe VPS sau verificare POSIX a fișierului pe Windows.

TLS local encrypt=true/trustServerCertificate=true: certificatul nu este
validat; nu reprezintă acceptanță TLS publică. Drepturile sunt verificate pentru
bootstrap și baza Demo cunoscută, nu se pretinde izolarea completă a tuturor
datelor/identităților de pe host.

## Instalare rămasă de pregătit

Pachet separat cu dependența mssql rezolvată local platformei (fără a folosi
node_modules ERP), secret creat prin prompt ascuns și fișier nou protejat,
drop-in systemd cu flag explicit, backup al fișierelor serviciului nou și rollback.
Validare înainte de activare; restart numai infraflow-demo-platform.
Nu s-a făcut niciuna dintre aceste mutații pe VPS în etapa curentă.

## Pachet reader-v1 pregătit separat

Dependență directă mssql 12.5.4, lockfile propriu în server/demo-platform.
Rezolvarea inițială a adus Azure cu engine Node >=22; fixate override-uri la
versiunile Node20 din lockfile-ul ERP, fără modificarea dependențelor ERP.
Verificare tuturor intervalelor engines.node față de 20.20.2: trecută.
npm ci --ignore-scripts --omit=dev a reușit local (85 pachete). Aceasta nu
înlocuiește proba driverului și TLS pe Linux. Nu include node_modules Windows
în arhivă: npm ci se execută neprivilegiat în staging pe VPS cu engine-strict.

Instalator nou: scripts/linux/install-demo-platform-reader.py. Refuză secret,
release sau drop-in existente; părinți root fără group/world write și fără
symlink. Creează release SQL distinct și secret root:grup serviciu 0640 prin
prompt ascuns, fără newline/argv cu secret. Parola loginului există deja; nu
creează/modifică loginuri sau baze. Verifică SQL ca utilizatorul OS al serviciului
înainte de cutover, apoi creează drop-in pentru ExecStart și flagul SQL.
Restart numai infraflow-demo-platform; așteaptă diagnosticul SQL. La eșec după
activare încearcă rollback prin eliminarea numai a drop-in-ului creat în run,
reluând foundation; păstrează release/secret pentru revizuire, fără ștergere
automată și fără rerulare oarbă. Nicio garanție de rollback până la proba VPS.

Verificări curente: 6/6 Node, 3/3 Python bootstrap și 3/3 Python installer, prin
Python bundled; audit 530/zero. Testele Python sunt unitare, nu instalare Linux.
Nicio instalare/restart VPS executat de agent; transferul și execuția sunt pasul
următor al utilizatorului. Pachetul nu este update ERP și nu schimbă versiunea.
