# Bilanț stabilizare — 22 octombrie 2026

Versiune livrabilă: **2.12.735**, UPDATE 755. Nu este o certificare integrală ERP.
Nu s-au instalat pachete sau repornit serviciile clientului/Demo.

## 1. Verificat

1. Sesiuni: inactivitate, limită absolută, expirare Demo și invalidare token,
   prin aplicația reală `server/app.js` pe bază MSSQL sintetică.
2. 2FA: activare, cod greșit, provocare expirată/consumată, cod de recuperare
   nereutilizabil după restart și autentificare TOTP. Proba combinată: 52 cereri,
   două porniri. Chei și date exclusiv sintetice.
3. Backup nativ MSSQL: BACKUP CHECKSUM, VERIFYONLY, modificare și RESTORE pe
   aceeași bază sintetică; snapshotul, rândul relațional și secretul se păstrează.
4. Restaurare JSON: corectată pierderea domeniilor noi și a setărilor; validare
   înainte de backup/salvare. Test de router HTTP cu adaptoare sintetice.
5. Persistență JSON: validator → `core/db.writeDb` → proces nou → `core/db.readDb`.
   CRM, Documente, Mesaje, departamente, extensie necunoscută și secret criptat
   rămân citibile. Probă locală în director temporar, fără baza instalată.
6. Ultima rulare focalizată restaurare: **5/5 teste trecute**. `test:backup` și
   `release:check` trecute. Buildul/auditul din livrarea precedentă au trecut.

## 2. Limite care nu trebuie confundate cu funcții terminate

1. JSON nu include fișierele storage, APP_KEY sau tabelele relaționale separate.
2. Proba SQL nativă nu dovedește recuperarea completă UI/serviciu/storage.
3. Nu s-a probat încă restaurarea HTTP completă urmată de verificarea sesiunilor
   deja deschise, a cache-urilor și a tuturor modulelor relaționale.
4. Crypto păstrează formatul AES-CBC și fallback-ul legacy; nu reprezintă trecere
   la criptare autentificată. Cheia originală trebuie păstrată separat.
5. Migrarea relațională experimentală nu este activată; prototipurile Core nu
   sunt un importator complet. Porțile de pilot din planul Core rămân valabile.

## 3. Următorul prag înainte de wizard Demo

1. Instalați update-ul 2.12.735 în ferestrele de mentenanță alese; verificați
   health și versiunea pe PC și server. Această instalare nu este confirmată aici.
2. Faceți o repetiție de recuperare într-o **copie autorizată și izolată**:
   baza nativă SQL + storage + APP_KEY/configurație protejată. Nu restaurați
   experimental peste instalația folosită de utilizatori.
3. Verificați login, 2FA, o ofertă, un document cu atașament și accesul unui rol
   limitat în copia recuperată. Măsurați durata reală, nu estimați un RTO.
4. După acceptare, proiectați izolarea Demo pe companie și regulile de ștergere,
   apoi wizard-ul. Nu se implementează acum separarea prin simple filtre UI.

Arhivele Windows/Linux 2.12.735 conțin corecția runtime. Testul suplimentar de
persistență și acest bilanț sunt ulterioare construirii lor; runtime-ul nu s-a
schimbat, deci nu s-a regenerat aceeași versiune și nu s-a creat un update nou.

## 4. Probă de recuperare pe laptop — rezultat ulterior

La cererea utilizatorului, proba izolată a fost executată prin
`INFRAFLOW_TEST_RECOVERY_SQL=1 node --test server/tests/reconstructed-context-http.test.js`.
Rezultat final: **1/1 trecut, 53 cereri HTTP, două porniri**, aproximativ
259 secunde pentru întreaga suită. Baza: `INFRAFLOW_TEST_DOCS_E35ED2622181`.

1. Copie de cod în director temporar, bază SQL cu nume aleatoriu, port loopback
   liber, scheduler oprit, date și APP_KEY sintetice. Nicio licență reală copiată:
   verificarea semnăturii folosește o pereche RSA creată numai pentru această copie.
2. Backup nativ SQL cu CHECKSUM și VERIFYONLY; copii separate ale fișierului
   model Documente și `runtime/app.key`. Cheia nu este moștenită din env.
3. Oprește exclusiv procesul de test; deteriorează intenționat snapshotul SQL,
   referința relațională, fișierul și cheia sintetice. Restaurează SQL și copiile.
4. După repornire: tokenul vechi este refuzat, contul dezactivat rămâne inactiv,
   TOTP funcționează, codul de recuperare consumat rămâne invalid și numărul
   codurilor disponibile este nouă. Fișierul model se descarcă autorizat prin
   API și este identic octet cu octet.
5. Procesul de test este oprit în `finally`. Bazele/backupurile și directoarele
   sintetice sunt păstrate pentru diagnostic; nu sunt date de producție.

Primele două rulări au identificat probleme în pregătirea testului: lipsa unei
licențe cu Documente în copia izolată și referința fișierului pregătită numai în
tabele relaționale în loc de app_state. Ambele au fost corectate în test, nu în
runtime. Nu s-a declarat succes pentru rulările eșuate.

Limite rămase: această probă nu validează o ofertă CRM, toate atașamentele, toate
modulele relaționale sau recuperarea unui client real. Nu testează restaurarea
prin UI/scripturile instalate ori comportamentul sesiunilor fără restart.
Cei circa 3,2 secunde afișați sunt doar etapa SQL/copiere înainte de pornire,
nu RTO end-to-end. Nu s-au repornit serviciile instalate și nu s-a confirmat
instalarea update-ului pe PC/server. Arhivele 2.12.735 rămân neschimbate.

Pragul tehnic sintetic SQL/storage/APP_KEY este acum verificat în limitele de
mai sus. Se poate trece la proiectarea izolării Demo; acceptarea operațională
pe o copie reală și instalarea pachetelor rămân pași separați.
