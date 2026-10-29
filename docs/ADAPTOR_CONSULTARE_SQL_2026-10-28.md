# Identitatea de consultare a adaptorului — local

Migrarea 011 creează exclusiv procedura read_adapter_resource_review, după 010.
Nu creează login și nu acordă drepturi. Proiecția întoarce jobul queued, compania
neactivată, manifestul și șapte rezervări într-o tranzacție scurtă cu HOLDLOCK.
Nu expune hash-ul/tokenul lease-ului, conturi operator sau parole. Datele sunt
verificate apoi de provision-resource-review.js, care rederivă toate numele.

Identitatea planificată infraflow_demo_adapter_review este distinctă de worker,
operator și viitorul executor privilegiat. Politica locală acceptă numai EXECUTE
pe procedura de consultare; respinge drepturi server/bază excesive și accesul la
ERP. Această funcție validează metadate, nu creează identitatea și nu reprezintă
o probă de autentificare cu login SQL real. Nu există încă transport montat.

O consultare validă nu acordă drept de execuție. Snapshotul poate deveni vechi
imediat după tranzacție; nu este fencing al efectelor externe.

## Separare de rezolvat înainte de execuție

record_step_intent cere USER_NAME egal cu proprietarul lease-ului. Adaptorul nu
va reutiliza parola infraflow_demo_lease pentru a impersona workerul. Intenția
trebuie înregistrată de deținătorul lease-ului, iar executorul separat trebuie
să primească o delegare restrânsă, verificabilă, cu jurnal/reconciliere. Nu se
introduce EXECUTE AS OWNER generic ori acces SA în runtime pentru a ocoli această
limită. Protocolul de delegare și executorul nu sunt implementate prin 011.

Pe VPS rămâne instalată schema până la 009. 010 și 011 sunt locale, fără arhivă,
granturi sau restart. Nu s-au creat baza/identitatea/directoarele companiei.

## Rezultate

132 teste Node trecute; audit 601 fișiere, zero constatări. Proba SQL
INFRAFLOW_TEST_TRIALS_CAF6B0E1DF28: opt grupuri trecute, passed=true, cleanup=true.
Proiecția SQL reală a trecut validatorul celor șapte rezervări. Utilizatorul SQL
fixture-ului, fără login, a putut executa numai consultarea: SELECT direct pe
joburi/conturi operator, record_step_intent și provision_lease_command refuzate
cu 229. Jobul a rămas revizie/generație/execuție 0 și jurnalul gol.

Nu este încă probă cu login SQL autentificat al adaptorului pe VPS. Niciun login
real nou nu a fost creat prin acest test; baza temporară a fost eliminată.
