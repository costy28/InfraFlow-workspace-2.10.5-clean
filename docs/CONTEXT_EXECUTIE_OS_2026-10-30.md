# Context SQL curent pentru executorul OS

Etapă privată a platformei Demo, fără modificarea versiunii ERP 2.12.736.

## Ce introduce migrarea 017

Procedura `platform.verify_os_identity_execution_context` verifică din nou identitatea
executorului, tokenul delegării, acceptarea, generația/revizia jobului, compania,
rezervarea OS canonică și absența unui rezultat deja înregistrat.
Termenul efectiv este minimul dintre delegare, acceptare și lease. Sunt necesare
minimum 15 secunde rămase. Timpul SQL este recitit după citirile care pot bloca.

Răspunsul nu conține tokenul, nu prelungește lease-ul și păstrează
`executionAllowed=false`. `contextReady=true` înseamnă doar că verificarea SQL a
reușit la acel moment, nu că s-a creat sau autorizat un utilizator Linux.

Blocările sunt eliberate la terminarea tranzacției. Nu există atomicitate între
SQL și comenzile OS. Executorul viitor trebuie să folosească separat aprobarea
locală explicită, blocarea resursei pe host, bugetul de timp și inventarul înainte
de fiecare comandă. Nu se reiau automat operațiunile cu rezultat incert.
Bugetul primit trebuie redus cu întreaga durată a cererii, măsurată monoton
înaintea trimiterii, și cu o marjă pentru înregistrarea rezultatului. Nu se
folosește ceasul hostului pentru a prelungi termenul SQL.

Referință pentru durata blocărilor `HOLDLOCK`:
[Microsoft Learn — Table hints](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table).

## Instalare controlată pe VPS

1. Transferă arhiva și verifică SHA-256 comunicat separat.
2. Extrage într-un director nou și rulează numai preflight-ul SQL ca SA, pe
   `INFRAFLOW_DEMO_PLATFORM`. Așteaptă `OS_CONTEXT_PREFLIGHT_OK` și jobul queued/5/2/0.
3. Rulează backup-ul pre017 și păstrează calea afișată. `RESTORE VERIFYONLY`
   verifică backup-ul, dar nu înlocuiește un test real de restaurare.
4. După confirmare separată, aplică migrarea 017. Marker: `OS_EXECUTION_CONTEXT_APPLIED`.
5. Verifică markerul migrării și că jobul, lease-ul și registrele OS au rămas neschimbate.

Nu sunt acordate permisiuni noi loginului executorului în această arhivă.
Verificatorul de credentiale deja instalat rămâne compatibil cu profilul lui de
două proceduri. Extinderea drepturilor și runtime-ul vor fi o etapă distinctă.
Nu se cer parole noi, nu se creează conturi Linux și nu se repornește ERP/platforma.

## Validare locală încheiată la 31 octombrie 2026

- 174 teste Node pentru platforma privată: trecute.
- Audit advisory: 626 fișiere, zero constatări.
- Proba SQL nativă: 10 grupuri trecute, `passed=true`, `cleanup=true`.
  Baza sintetică `INFRAFLOW_TEST_TRIALS_42993AC487C5` a fost eliminată de fixture.
- Proba confirmă aplicare/reaplicare, context valid fără autoritate OS, refuz
  identitate/token/manifest greșit, termen insuficient și rezultat deja înregistrat.
- Verificarea reală pe VPS rămâne de executat; nu este inclusă în aceste rezultate.

## Erori

- 54210: identitate SQL greșită; nu folosi SA ca înlocuitor al executorului.
- 54211: intrare invalidă; nu publica tokenul pentru diagnostic.
- 54212: legătură sau lease nevalid; verifică metadatele fără reluare automată.
- 54213: există deja rezultat; este necesară reconciliere, nu repetarea comenzilor.
- 54214: timp insuficient; nu executa o comandă OS pe baza răspunsului anterior.
- Eroare la migrare: oprește fluxul și inspectează starea, fără ștergeri/restaurări automate.
