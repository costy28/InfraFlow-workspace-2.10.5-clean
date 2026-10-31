# Orchestrator pilot și jurnal local protejat

Cod privat, fără CLI de creare și fără servicii noi montate. ERP rămâne 2.12.736.
Pachetul canary nu conține conexiuni SQL sau comenzi de creare de conturi.

## Flux intern

Orchestratorul primește numai porturi explicite de încredere. Nu are clienți SQL
sau executor OS implicit. Verifică aprobarea locală, inventarul și legăturile
job/trial, generează intentul și două tokenuri distincte, apoi cere salvarea lor
durabilă înaintea primei cereri de lease.

Pentru fiecare operațiune există un eveniment `*_requested` înaintea apelului și
un eveniment de confirmare după validarea răspunsului: claim → intent → delegare →
acceptare → host → rezultat → release. Nu sunt implementate activarea sau pornirea
perioadei de 15 zile. Reușita identității rămâne `requires_review`.

Răspunsurile sunt legate de aceeași generație/revizie; UID/GID trebuie să fie
pozitive, iar mesajele SQL rămân fără autoritate OS. Portul host trebuie să
folosească separat garda/contextul proaspăt, lock-ul și runnerul deja testate.
Un boolean din browser nu reprezintă aprobare root; acest modul este exclusiv intern.

## Persistență și recuperare

Părintele jurnalului trebuie precreat root:root 0700 pe Linux. Un singur director
pe job, creat exclusiv: un job deja existent, chiar parțial sau finalizat, nu se
reia automat. Bootstrap-ul și evenimentele sunt root:root 0600, fără symlink sau
hardlink. Fișierele sunt create exclusiv, sincronizate cu fsync, apoi este
sincronizat directorul. Bootstrap-ul trebuie să existe și să rămână neschimbat
înaintea fiecărui eveniment nou. Evenimentele sunt numerotate și legate prin hash,
primul fiind legat de digestul bootstrap-ului.

Tokenurile sunt păstrate în bootstrap sub protecția accesului OS, **nu criptate**.
Nu se afișează și nu sunt copiate în evenimente sau erori. Protecția nu este față
de root. Lanțul hash detectează inconsistențe, nu modificări intenționate făcute
de un administrator root care poate rescrie întregul jurnal.

La timeout, pierdere de răspuns sau eroare de scriere se cere verificare manuală.
Nu se repetă efectul, nu se trimite automat al doilea rezultat și nu se încearcă
release, ștergere sau adoptare compensatorie. Dacă nici markerul de review nu poate
fi scris, ultimul `*_requested` persistat rămâne semnalul conservator. Inspectarea
întoarce numai legături/stare, fără tokenuri și întotdeauna `resumeAllowed=false`.

SQL și jurnalul/OS nu sunt o tranzacție atomică. Nu există încă o comandă de
reconciliere administrativă sau de reluare. Montarea porturilor reale și primul
cont pe VPS necesită altă etapă și confirmare distinctă.

## Canary pe VPS

`sudo python3 -B scripts/linux/probe-demo-os-pilot-journal.py --probe-confirmed`

Proba folosește numai propriul director temporar sub `/run` și identificatori
canary. Verifică scrierea/inspectarea privată, refuzul duplicării/linkurilor și al
unui eveniment parțial, apoi rulează orchestratorul cu **toate porturile de efect
simulate**. Verifică o reușită simulată și un răspuns host pierdut fără retry,
raportare sau release compensatoriu. Curăță numai directorul temporar propriu.
Nu atinge jurnale de producție, SQL, NSS, conturi sau servicii existente.

Așteptate:
- `OS_PILOT_JOURNAL_PRIVATE_APPEND_ONLY_OK`
- `OS_PILOT_JOURNAL_DUPLICATE_LINKS_DENIED_OK`
- `OS_PILOT_JOURNAL_PARTIAL_EVENT_DENIED_OK`
- `OS_PILOT_SIMULATED_PORTS_DURABLE_FLOW_OK`
- `OS_PILOT_INTERRUPTION_NO_RETRY_NO_COMPENSATION_OK`
- `OS_PILOT_JOURNAL_CANARY_CLEANUP_OK`

La eroare nu relua automat; trimite doar markerul. Această probă nu reprezintă o
creare reală de cont și nu validează încă porturile SQL/OS reale ale orchestratorului.

Validare locală: 11 teste Python ale orchestratorului/jurnalului și 188 teste Node
ale platformei trecute; audit advisory 638 fișiere, zero constatări. Testele de
persistență POSIX sunt de confirmat prin canary pe VPS; testele Windows folosesc
porturi de fișier simulate și nu dovedesc singure permisiunile Linux/fsync.
