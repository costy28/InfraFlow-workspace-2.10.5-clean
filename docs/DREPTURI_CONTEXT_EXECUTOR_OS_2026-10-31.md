# Executor OS: profil SQL de trei proceduri

Etapă separată de ERP, fără schimbarea versiunii 2.12.736.

## Scop

După migrarea 017 verificată pe VPS, loginul EXISTENT `infraflow_demo_os_executor`
primește un singur drept nou: EXECUTE pe `platform.verify_os_identity_execution_context`.
Rămân permise acceptarea delegării și înregistrarea rezultatului. Nu sunt acordate
drepturi de citire/scriere directă, lease, creare delegare, activare sau administrare.
Nu se schimbă parola și nu se creează alt login.

Tranziția cere profilul anterior de două RPC, identitate SQL dedicată fără roluri
sau ownership și lipsa operațiunilor OS/lease-urilor în desfășurare. Validarea noului
profil este în aceeași tranzacție cu grantul. La eșec se revine prin rollback SQL;
nu se lansează operațiuni OS sau restaurări de backup.

## Ordine pe VPS

1. Transfer și verificare hash, extragere într-un director nou.
2. `sudo python3 -B scripts/linux/stage-demo-os-context-check.py --check-only`:
   verifică numai metadatele credentialei existente și destinațiile. Nu citește
   parola și nu face SQL. Așteaptă `OS_CONTEXT_CHECK_DESTINATIONS_OK`.
3. Ca SA, pe `INFRAFLOW_DEMO_PLATFORM`, rulează
   `scripts/linux/preflight-demo-os-context-scope.sql`. Marker:
   `OS_CONTEXT_SCOPE_PREFLIGHT_OK`.
4. După confirmare distinctă, aplică `scripts/linux/grant-demo-os-context-scope.sql`.
   Marker: `OS_EXECUTOR_CONTEXT_SCOPE_APPLIED`. Nu relua automat.
5. `sudo python3 -B scripts/linux/stage-demo-os-context-check.py --stage-confirmed`
   instalează cod nou separat și pornește numai proba tranzitorie de metadate.
   Marker: `OS_EXECUTOR_CONTEXT_CREDENTIAL_SQL_OK`, apoi `OS_CONTEXT_CHECKER_STAGED`.

## Cod și credentiale

Release nou: `/opt/infraflow-demo-platform/releases/os-executor-context-check-v1`.
Credentiala root:root 0600 existentă este folosită prin systemd LoadCredential,
fără rescriere, afișare sau parolă în argumente. Proba folosește DynamicUser și
doar interogări de metadate, fără apelarea celor trei RPC. Nu este un executor OS.
Unitatea tranzitorie: `infraflow-demo-os-context-check.service`, identitate dinamică
`infraflow-os-context-check`; ambele trebuie să lipsească înaintea instalării.

Verificatorul vechi rămâne nemodificat, dar NU se mai rulează după extinderea
drepturilor: refuză corect profilul cu trei RPC. Nu se suprascrie release-ul vechi.
Helperul pentru credentiala adaptorului inclus în arhivă este importat numai
pentru verificarea căilor și scriere exclusivă a codului, nu se rulează instalatorul lui.

Nu există restart al ERP/platformei, job nou, delegare sau cont Linux persistent.
La eșec codul parțial rămâne pentru inspecție; nu se șterge sau reia automat.
Root rămâne administrator de încredere, nu promitem izolare față de root.

## Dovezi locale, 31 octombrie 2026

176 teste Node și 4 teste Python trecute; audit advisory 629 fișiere, zero constatări.
Proba SQL nativă pe `INFRAFLOW_TEST_TRIALS_5AE1F15110EC`: 8 grupuri trecute,
`passed=true`, `cleanup=true`; loginul SQL sintetic a fost eliminat înaintea bazei.
Au fost verificate tranziția efectivă de la două la trei proceduri, refuzul
rolului prea larg și al reaplicării, păstrarea refuzului citirii directe și a
celorlalte comenzi. Procedurile sunt atinse numai până la garda identității
sintetice: nu se creează delegări, acceptări sau rezultate OS în această probă.

O probă inițială a eșuat în fixture-ul de bază; următoarele au identificat o
problemă de raportare a erorii la reaplicare. Tranziția a fost corectată astfel
încât validarea să revină la identitatea administrativă înainte să emită eroarea.
Toate bazele/loginurile sintetice din aceste încercări au fost curățate.

Proba systemd cu credentiala reală a acestui nou pachet rămâne de executat pe VPS;
testele locale nu o înlocuiesc. Nu există dovadă de creare a unui cont Linux aici.
