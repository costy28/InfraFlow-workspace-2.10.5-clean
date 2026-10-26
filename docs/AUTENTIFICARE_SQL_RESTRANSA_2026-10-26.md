# Autentificare fără SA la runtime — pregătire locală

Migrare 004_operator_procedures.sql: patru proceduri în operator_security,
read_account/reserve_attempt/claim_totp/append_audit. Nicio identitate, grant,
modificare de cont operator sau restart prin această migrare. Refuz DB greșit,
dependență de 003, application lock/tranzacție și marker idempotent 004.

Procedurile acceptă numai JSON cu setul exact de chei și tipurile așteptate,
UUID valid, revizie/counter negați refuzați. Bugetul și timpul sunt fixe SQL,
nu configurabile din cererea browserului. Ownership chaining în aceeași schemă
permite execuția fără SELECT/UPDATE direct; nu folosesc EXECUTE AS OWNER sau
SQL dinamic derivat din payload. read_account întoarce hash+secret criptat
numai apelantului tehnic; nu se publică acest rezultat prin HTTP.

server/demo-platform/operator-sql-client.js folosește identitatea fixă
infraflow_demo_auth (încă necreată pe VPS), baza fixă a platformei și RPC
request.execute cu JSON parametrizat. Nu expune query arbitrar, ținte sau
identități configurabile din request. Maximum două operații active, fără coadă
nelimitată; timpi connect/request 5 secunde. Erori mascate, pool privat, shutdown
așteaptă activele și închide pool. TLS local are trustServerCertificate=true,
nu certificare TLS publică.

Adaptorul store poate folosi procedures=true, caz în care emite numai numele
operațiilor acceptate de client; modul vechi cu SQL inline rămâne pentru probele
administrative existente. Nu există fallback la SA. Nucleul crypto/auth este
neschimbat. Modul proceduri trebuie selectat explicit la compunerea serviciului.

## Verificări

30/30 teste locale Node trecute (4 noi pentru client/mod proceduri/concurență și
regresii). Prima încercare a avut o eroare de sintaxă în fake-driver-ul testului,
corectată înainte de rerulare; nu se declară acea încercare trecută. Clientul
Node este testat cu driver simulat, nu încă RPC real sub loginul permanent.
Proba SQL extinsă rulează separat: aplicare/reaplicare, apeluri sub USER WITHOUT
LOGIN cu EXECUTE pe cele patru proceduri și DENY DML/SELECT pe schema securității,
apoi negative pe acces direct. Rezultatul se adaugă după finalizare și cleanup.

Nu s-a creat loginul pe VPS și nu s-a montat HTTP/UI. Urmează aplicarea 004
autorizată, login tehnic cu EXECUTE strict pe patru obiecte și refuzul procedurilor
comerciale, apoi probă Node reală fără SA și abia apoi serviciul/browserul.
Cheia operatorului root 0600 nu este transmisă serviciului de citire existent;
livrarea ei către un serviciu dedicat prin credential protejat rămâne separată.

## Rezultate SQL

Rularea extinsă inițială 94ABE37A1DA2 s-a oprit înainte de 004 din cauza
expirării counterului pregătit de testul vechi de înrolare (51703). Cleanup
confirmat. Acea rulare nu se declară trecută și nu dovedește eroare în 004.

Probă focalizată nouă, cu INFRAFLOW_TEST_OPERATOR_PROCEDURES_ONLY=1, pe
INFRAFLOW_TEST_TRIALS_F243AE559BD8: patru grupuri assertions trecute. Fișierele
001–004 aplicate cu numai literalul DB_NAME de guard substituit în memorie;
004 original refuză baza greșită și reaplicarea este no-op. Utilizator nou
WITHOUT LOGIN numai în baza temporară, EXECUTE pe patru proceduri și DENY
SELECT/DML pe operator_security. Citire/decriptare reușită, exact 5 din 8
rezervări concurente, un singur claim TOTP concurent, audit prin procedură.
SELECT direct, UPDATE direct și EXEC platform.queue_trial refuzate cu 229;
payload suplimentar refuzat cu 51810. Trigger exclusiv de test pe audit:
bugetul și counterul rămân nemodificate după eșecul procedurilor. Trigger eliminat.

passed=true,cleanup=true,error=null. Baza temporară DROP fără KILL/SINGLE_USER,
absența verificată. Fără loginuri server create și fără acces VPS. Audit 544
fișiere, zero constatări. 30/30 teste Node locale separate trecute, zero skip.
Nu este încă probă Node RPC cu loginul SQL permanent, nici instalare Linux.

Următorul pas autorizabil separat: aplicarea numai a migrării 004 pe VPS;
loginul infraflow_demo_auth, credentialul și restartul unui serviciu nu sunt
create/efectuate prin această migrare.
