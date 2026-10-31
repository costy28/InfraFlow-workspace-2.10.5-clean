# Gardă de execuție OS și probă de blocare pe host

Etapă privată. ERP 2.12.736, serviciile existente și SQL-ul de pe VPS nu sunt modificate.

## Cod local

- Client SQL dedicat: profilul exact de trei RPC este verificat înaintea fiecărei
  cereri parametrizate către `verify_os_identity_execution_context`. Clientul nu
  apelează acceptarea sau raportarea și nu exportă o metodă SQL arbitrară.
  Răspunsurile trebuie să fie canonice, legate de intent, fără autoritate OS și cu
  termen de 15–60 secunde. Erorile incerte închid logic transportul, fără retry.
- `guarded_execute` leagă separat aprobarea locală root, planul canonic, contextul
  SQL curent și porturile executorului. Aprobarea nu se preia din browser/worker.
  Contextul este recitit înainte de groupadd și useradd, sub aceeași blocare pe
  identitate. Se scade durata cererii folosind ceas monoton; runnerul de încredere
  trebuie să impună timeout de 5 secunde și să termine propriul arbore de procese.
- `flock` exclusiv și neblocant pe fișier root:root 0600, un singur hardlink,
  director precreat root 0700. Nu se șterge fișierul la unlock: concurenții trebuie
  să folosească același inode. Symlink-urile, hardlink-urile și căile nesigure sunt refuzate.

Nu există încă un CLI de creare și nu este montat un nou serviciu privilegiat.
Porturile reale de execuție/observare/raportare și transportul dintre procese nu
sunt instalate prin acest pachet. Testele porturilor fake nu reprezintă o creare OS.
Blocarea pe host nu face SQL și OS atomic; root rămâne administrator de încredere.
Blocarea `flock` este cooperativă: protejează executori care respectă același
protocol, nu împiedică un administrator root să ruleze manual alte comenzi.
Referință: [Ubuntu 24.04 — flock(2)](https://manpages.ubuntu.com/manpages/noble/man2/flock.2.html).

## Pachetul pentru VPS: numai canary de kernel

Arhiva conține garda Python, scriptul de probă și acest document. Nu conține un
updater ERP, migrări sau credentiale. Rulează din directorul extras:

`sudo python3 -B scripts/linux/probe-demo-os-host-lock.py --probe-confirmed`

Proba creează numai un director temporar propriu sub `/run`, verifică refuzul unui
al doilea proces pe același lock, eliberarea cu păstrarea inode-ului și refuzul
symlink/hardlink. Șterge doar propriul director canary la final. Nicio identitate
tenant nu este creată, inspectată în NSS sau adoptată.

Așteptate: `OS_HOST_CONCURRENT_LOCK_DENIED_OK`, `OS_HOST_LOCK_RELEASE_SAME_INODE_OK`,
`OS_HOST_LOCK_SYMLINK_DENIED_OK`, `OS_HOST_LOCK_HARDLINK_DENIED_OK`,
`OS_HOST_LOCK_CANARY_CLEANUP_OK`.

La orice eroare trimite numai markerul, fără reluare automată. Rezultatul real de
kernel pe Linux rămâne de confirmat pe VPS; testele locale rulează pe Windows.

## Validare locală

179 teste Node ale platformei și 5 teste Python ale gărzii trecute.
Audit advisory: 631 fișiere, zero constatări. Au fost testate ordinea
lock → inventar → context → comandă, recitirea contextului la fiecare pas,
legăturile greșite, timpul consumat/ceasul nevalid, timeout-ul și lipsa retry-ului.
Runnerul acestor teste este fake: nu au fost rulate groupadd/useradd.
