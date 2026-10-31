# Worker: dreptul de pregătire a delegării OS

Etapă privată, ERP rămâne 2.12.736. Nu creează sau activează un tenant.

## Drepturi

Login EXISTENT: `infraflow_demo_lease`. Profilul actual trebuie să aibă exact:
`provision_lease_command`, `record_step_intent`, `adapter_review_ticket_command`.
Se acordă un singur drept nou, EXECUTE pe `platform.prepare_os_identity_delegation`.

Workerul nu primește acceptare, verificare de context a executorului, raportare
rezultat OS, activare, DML direct, roluri sau ownership. Parola lui nu este schimbată.
Noua procedură pregătește doar delegarea legată de lease/intent; nu creează conturi.
Scriptul de grant nu apelează nicio procedură de job/delegare și nu preia lease-ul.

Tranziția cere schema 017 și lipsa operațiunilor OS/lease-urilor în desfășurare.
Validează profilul anterior înainte de grant și profilul exact de patru proceduri
în aceeași tranzacție. Reaplicarea și drepturile prea largi sunt refuzate. La eroare
se oprește fluxul pentru verificare, fără retry sau ștergere automată.

## Verificator separat

Release nou: `/opt/infraflow-demo-platform/releases/worker-os-delegation-check-v1`.
Credentiala existentă `/etc/infraflow-demo-platform/lease-sql.password` root:root
0600 este folosită prin LoadCredential, fără rescriere, afișare sau argumente cu parolă.
Unitate tranzitorie: `infraflow-demo-worker-os-delegation-check.service`.
DynamicUser: `infraflow-worker-os-check`; numele trebuie să fie liber în NSS.
Nu se instalează unități permanente și nu se repornește niciun serviciu existent.

Verificatoarele vechi de worker cu profil de una/trei proceduri NU se mai rulează
după extindere: trebuie să refuze profilul nou. Nu se suprascriu release-urile vechi.
Helperul de credentiale inclus este importat numai pentru verificări de cale și
scriere exclusivă a codului; main-ul său nu este executat.

## Ordine de aplicare

1. Transfer, hash, extragere într-un director nou.
2. `sudo python3 -B scripts/linux/stage-demo-worker-os-delegation-check.py --check-only`.
   Marker: `WORKER_OS_DELEGATION_CHECK_DESTINATIONS_OK`; fără SQL/citirea secretului/scrieri.
3. Ca SA, pe INFRAFLOW_DEMO_PLATFORM:
   `scripts/linux/preflight-demo-worker-os-delegation-scope.sql`.
   Marker: `WORKER_OS_DELEGATION_SCOPE_PREFLIGHT_OK`.
4. După confirmare separată, aplică
   `scripts/linux/grant-demo-worker-os-delegation-scope.sql`.
   Marker: `WORKER_OS_DELEGATION_SCOPE_APPLIED`.
5. `sudo python3 -B scripts/linux/stage-demo-worker-os-delegation-check.py --stage-confirmed`.
   Așteaptă `WORKER_OS_DELEGATION_CREDENTIAL_SQL_OK` și `WORKER_OS_DELEGATION_CHECKER_STAGED`.

La eroare nu relua automat. Codul parțial rămâne pentru inspecție. Nu trimite parola
SQL, parola SA sau conținutul fișierelor protejate. Root rămâne de încredere.

## Validare locală

184 teste Node ale platformei și 4 teste Python ale stagerului trecute.
Audit advisory: 636 fișiere, zero constatări.
Proba SQL nativă pe `INFRAFLOW_TEST_TRIALS_6F9C873CE9F5`: 8 grupuri trecute,
`passed=true`, `cleanup=true`; loginul sintetic a fost eliminat înaintea bazei.
Au fost confirmate profilul inițial de trei proceduri, noul drept efectiv,
refuzul unui rol prea larg, al reaplicării, al citirii directe și al RPC-urilor
executorului/activării. O intrare invalidă către noua procedură este refuzată
în parser, fără lease/delegare creată; jobul sintetic a rămas queued/0/0/0.
Pe VPS jobul pilot trebuie să rămână queued/5/2/0.

Autentificarea reală prin noua unitate systemd cu credentiala existentă rămâne de
confirmat pe VPS. Nu este înlocuită de testele locale și nu începe cele 15 zile.
