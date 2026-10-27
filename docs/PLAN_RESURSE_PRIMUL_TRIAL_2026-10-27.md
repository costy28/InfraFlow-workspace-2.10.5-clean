# Plan de resurse — prima companie înregistrată

## Dovezi primite pe VPS

Referință aprobare pilot:20261027-001, Companie Test InfraFlow: queued/revizie0,
1 comandă, 1 audit corelat; infraop/revizie1/trial.queue. Verificare finală:
infraflow_demo_registrar|operator_corelat=1|digest_corelat=1.
Nu s-a creat sau pornit o instanță ERP; cele 15 zile nu au început.

## Plan intern, nu autoritate de execuție

provisioning-plan.js acceptă doar un rând trusted queued/revizie0, fără date de
activare, și verifică toate cele patru bindings față de UUID-ul canonic. Nu există
rută HTTP pentru acest plan; nu primește nume de baze/căi/porturi din browser.
Nu citește/scrie fișiere sau SQL, nu alocă port și nu creează job ori resurse.

- DB: exact INFRAFLOW_DEMO_T_<UUID fără cratime uppercase>, identic coloanei
  calculate din registru; login/user SQL dedicați infraflow_t_<uuid compact>.
- Identitate Linux propusă: ift_<primele28 hex din UUID>, maximum32 caractere,
  cu grup dedicat. Trunchierea impune verificare explicită de coliziune și legare
  durabilă a identității înainte de creare. Nu se adoptă automat un cont existent.
- Unități systemd distincte infraflow-trial-<uuidcompact>.service.
- Storage/state per UUID în /var/lib/infraflow-demo-tenants; configurație și
  sursa cheii per UUID în /etc/infraflow-demo-tenants. Sunt propuneri necreate,
  nu directoare sau drepturi deja instalate.
- Cheia APP_KEY și parola SQL vor fi generate distinct pe trial și livrate prin
  credentiale; nu se copiază cheia/parolele/demo.env ale ERP-ului existent.
- Release de cod și port rămân explicit nealocate; startAllowed=false.
- Politica SQL/OS din plan este o cerință țintă, nu dovadă că izolarea funcționează.

Amprenta planului detectează schimbări, nu autorizează comenzi și nu ține loc de
lease. Nu se creează resurse din simpla existență a unui plan/hash.

## Porți înainte de provisionare

1. Confirmarea UUID-ului și bindings-urilor curente din registrul SQL.
2. Inventar read-only pentru coliziuni: DB/login/user OS/grup/unități/directoare.
   O resursă existentă oprește fluxul; nu se șterge sau reutilizează automat.
3. Job/lease/generație și bindings durabile în control plane; worker și adaptor
   privilegiat restrâns, neexpuse runtime-ului. Nu sunt implementate încă aici.
4. Release ERP curat fără date/secrete locale și bootstrap/migrări separate.
   server/core/db.js necesită inventar al DDL-ului la pornire înainte să putem
   promite runtime fără DDL/db_owner. Nu acordăm sysadmin pentru a trece proba.
5. Alocare port rezervată durabil și gateway autorizat din registru; fără port
   ales manual din browser și fără rută publică directă către runtime.
6. Probe reale pozitive și negative A/B SQL și Linux: propriul domeniu funcționează,
   vecinul/control plane/secrete operator refuzate. Testele sintetice nu ajung.
7. Activare explicită numai după pregătire; de atunci încep cele 15 zile.

Acest increment nu modifică schema, starea queued, servicii sau resurse VPS.
