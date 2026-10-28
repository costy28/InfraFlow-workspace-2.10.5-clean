# Solicitarea jobului de pregătire — graniță locală, nemontată

`server/demo-platform/provision-request.js` oferă clientul RPC și coordonatorul
viitorului flux operator. Nu este montat în HTTP/UI/service și nu creează resurse OS/SQL.

1. Cererea utilizatorului conține exact trialId, expectedRevision, commandId și
   confirmed=true. Nu acceptă identitate operator, căi, porturi sau TTL.
2. Coordonatorul cere autorizare trial.prepare cu sesiune și CSRF.
3. operatorId/operatorRevision sunt preluate exclusiv din autorizarea sesiunii.
4. Clientul invocă numai platform.request_provision_job prin port injectat.
5. Răspunsul trebuie să fie queued, cu revizia trial incrementată și
   executionAllowed=false; nu înseamnă instanță creată sau trial activat.
6. După rezultat, sesiunea este verificată din nou pentru trial.read. Revocarea
   după commit produce rezultat neconfirmat, nu afirmația că nu s-a scris nimic.

Nu există retry automat, coadă de comenzi, conexiune SQL implicită sau credențială
folosită din serviciul existent. commandId trebuie păstrat pentru reconciliere.

## Blocaje intenționate înainte de activare

- Autoritatea operator-auth acceptă local trial.prepare numai cu scope explicit
  trial:prepare și CSRF. Această versiune nu este instalată pe VPS și nu s-a
  acordat scope operatorului infraop.
- Migrarea locală 008 extinde allowlist-ul auditului și procedura append_audit,
  fără schimbarea conturilor, granturilor sau secretelor. Nu este aplicată pe VPS.
- Modificarea scopes/revision trebuie să păstreze legătura criptografică AAD a
  secretului TOTP; nu se face un UPDATE simplu al reviziei.
- Este necesară o identitate SQL de solicitare cu EXECUTE exclusiv pe procedura
  request_provision_job, separată de identitatea lease și de registrar.
- Urmează transportul SQL dedicat, verificări native, apoi UI cu confirmare.

Testele actuale folosesc porturi simulate și nu reprezintă validarea end-to-end
a acțiunii operatorului. Pe VPS nu s-a creat niciun job prin această etapă.

## Revizie și TOTP

Nu modifica manual revision sau scopes_json. Secretul TOTP criptat este legat
prin AAD de UUID și revision. Pasul administrativ viitor trebuie să citească
revizia curentă, să decripteze și să recripteze același secret pentru revizia nouă,
apoi să actualizeze atomic revizia/scopes/envelope cu verificare CAS. O sesiune
emisă pentru vechea revizie va fi refuzată.

Pregătirea criptografică este implementată local în operator-prepare-change.js:
adaugă exclusiv trial:prepare, păstrează toate drepturile existente, refuză contul
inactiv, scope-uri necunoscute/duplicate sau deja acordate, crește revizia și
recriptează același secret. Întoarce snapshot-ul vechii revizii/envelope/scopes
pentru viitoarea comparație CAS, fără cheia sau TOTP plaintext. Acest obiect este
material administrativ privat, nu răspuns pentru browser și nu se jurnalizează.

Testul integrat în memorie confirmă reautentificarea cu același Authenticator și
invalidarea sesiunii vechi. Nu schimbă parola sau contorul TOTP prin pregătirea
planului.

## Persistare SQL administrativă (009, numai local)

Migrarea 009 adaugă operator_security.scope_changes și procedura grant_prepare_scope.
Aplicarea migrării nu modifică niciun cont și nu acordă EXECUTE. Procedura verifică
explicit identitatea administrativă sysadmin; nu este un endpoint pentru operator,
auth, registrar sau worker.

Procedura acceptă doar adăugarea trial:prepare, fără eliminarea drepturilor vechi,
cu cont activ, snapshot exact pentru scopes/envelope și revizie așteptată. În aceeași
tranzacție actualizează cele trei valori și scrie auditul cu identificatorul schimbării,
digestul cererii și actorul SQL, fără envelope/TOTP în tabelul de audit. Repetarea
exactă este idempotentă; o cerere concurentă cu snapshot vechi este refuzată.

SQL verifică structura envelope-ului, nu poate demonstra că secretul criptat este
același fără cheia aplicației. De aceea aplicarea trebuie făcută numai prin viitorul
instrument administrativ care decriptează/recriptează și verifică legătura AAD.
Nu se trimit planuri din browser și nu se apelează procedura cu envelope construit manual.

Instalatorul administrativ, validarea pe Linux și acordarea pe VPS rămân de făcut;
operatorul VPS nu a fost modificat. Scope nou nu implică drepturi SQL pentru solicitarea
jobului: identitatea tehnică separată rămâne o condiție de activare.

Proba SQL locală 009 a trecut: două cereri concurente au un singur câștigător,
retry-ul exact nu dublează auditul, snapshot-ul vechi este refuzat, iar eroarea
auditului anulează și schimbarea contului. Același secret TOTP se decriptează cu
noua revizie, nu cu cea veche; parola, last_totp_counter și attempt_count sunt păstrate.
`passed=true`, `cleanup=true` pentru baza sintetică INFRAFLOW_TEST_TRIALS_95ACD1B2E706.
Cele 104 teste Node trec; auditul fișierelor nu raportează constatări.

## Instrument administrativ pregătit local, încă neinstalat

`scripts/linux/grant-demo-platform-prepare.py` este CLI root + SA, cu confirmarea
textuală ACORD trial:prepare înainte de scriere. Citește UUID-ul din fișierul fix
operator-id root:root 0600 și folosește helperul Node operator-prepare-admin.js.
Helperul citește cheia existentă operator-auth.key cu descriptor fără symlink,
verifică root:root 0600, 32 bytes, un singur link. Cheia și secretul TOTP nu sunt
returnate către Python sau terminal; planul criptat circulă doar prin IPC capturat.
Bufferul cheii este zeroizat; nu se promite zeroizarea tuturor șirurilor JS/Python.

CLI face o singură aplicare, verifică exact revizia/envelope/scopes după commit și
decriptarea cu noua revizie. Nu consumă cod TOTP, nu schimbă parola, nu creează joburi
și nu repornește servicii. La rezultat incert nu reia automat și nu revine manual
la vechea revizie. Un rezultat postcheck eșuat poate urma unei schimbări deja comise.

**Ordine obligatorie înainte de rularea reală:**
1. Backup verificat al bazei platformei.
2. Aplicare și verificare 008 și 009 (fără schimbare cont).
3. Instalare controlată a runtime-ului operator compatibil trial:prepare, cu rollback
   și verificarea autentificării existente; eventualul restart numai al platformei
   necesită acord separat, ERP rămâne neatins.
4. Abia apoi acordarea scope-ului prin CLI. Altfel runtime-ul vechi refuză noul
   scope în validarea contului și autentificarea operatorului devine indisponibilă.
5. Reautentificare reală cu parolă și cod proaspăt din același Authenticator.

Testele CLI sunt simulate; rularea Linux root/sqlcmd/helper și noul login prin HTTPS
nu sunt încă probate. Nu este livrat un pachet de activare în această etapă.

## Transport dedicat de solicitare (pregătit local)

provision-request-sql.js folosește exclusiv login/user infraflow_demo_preparer,
baza INFRAFLOW_DEMO_PLATFORM și loopback 1433. Nu reutilizează registrar, auth,
lease sau SA. Singurul RPC acceptat este platform.request_provision_job, cu JSON
validat și parametru legat separat, metadate verificate înainte de fiecare apel,
pool de o conexiune, fără coadă/retry și cu shutdown controlat.

Scriptul restrict-demo-platform-preparer.sql configurează numai un login/user
deja existent și mapat corect. Cere schema 009, refuză roluri/proprietăți și drepturi
server/bază largi, refuză accesul direct la date și EXECUTE pe celelalte proceduri
private existente, inclusiv lease, activare și grant_prepare_scope. Nu creează login,
nu schimbă parola și nu execută procedura de solicitare în timpul verificării.

Aceste componente nu sunt instalate pe VPS. Testele transportului fix folosesc driver
simulat; scriptul de drepturi și clientul de solicitare au trecut proba nativă cu
login temporar la 28 octombrie, documentată în PROBA_PREPARER_SQL_2026-10-28.md.
Vizibilitatea metadatelor nu înlocuiește verificările administrative și probele
negative pe identitatea reală. Probele complete de solicitare HTTP/SQL rămân deschise.

Stare VPS confirmată ulterior notelor locale de mai sus: 008/009 aplicate, runtime
operator-prepare-compat-v1 sănătos, scope acordat prin CLI și reautentificare HTTPS
cu același Authenticator confirmată de utilizator. Niciun job creat prin acești pași.
