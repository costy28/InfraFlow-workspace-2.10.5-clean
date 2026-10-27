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
emisă pentru vechea revizie va fi refuzată. Acest pas nu este încă implementat.
