# Executor OS restrâns — verificare fără creare

VPS: 016 prezentă, zero rezultate/evenimente, job queued/5/2/gate 0.
Nu există încă loginul SQL al executorului sau un serviciu root instalat.

## Cod local

tenant-os-executor.py CLI acceptă exclusiv --check-only, ca root pe Linux.
Verifică executabilele și părinții root-owned fără scriere de grup/alții, suportul
pentru opțiuni prin --help și absența utilizatorului/grupului pilot prin getent.
Nu invocă useradd/groupadd pentru creare. Nu citește parole și nu execută SQL.

Comenzile viitoare sunt construite strict din UUID: groupadd --system, apoi
useradd --system, grupul primar dedicat, /nonexistent, fără home, fără grup nou
implicit, shell nologin, fără inițializare lastlog/faillog. Nu există --force,
--uid, --non-unique, --groups sau --password. UID/GID vor fi alocate de sistem.
Fără --password, useradd creează un cont cu parola blocată conform documentației.

Surse oficiale pentru Ubuntu 24.04:
- https://manpages.ubuntu.com/manpages/noble/man8/useradd.8.html
- https://manpages.ubuntu.com/manpages/noble/man8/groupadd.8.html

Funcția execute_with_ports este locală și nelegată de CLI/servicii. Testele îi
injectează exclusiv porturi fictive: inventar, autorizare, runner, observație și
raportare. Nu are runner sau transport de autoritate implicit. Cere o autorizare
explicită adevărată pentru fiecare comandă; toate receipt-urile SQL actuale false
sunt refuzate. Aceasta NU este încă dovada unui protocol SQL+OS sigur în producție.
Transportul autorizării reale, serializarea efectelor și colectorul complet de
observații OS rămân de legat și verificat înainte de activarea creării reale.

La eroare după o comandă posibil executată: review obligatoriu, fără adoptare,
ștergere sau retry automat. Un eșec la raportare nu produce al doilea raport;
prima scriere ar putea fi deja comisă. Root rămâne administrator de încredere.

## Pachetul VPS

Include executorul, inventarul read-only și această notă. Nu instalează servicii,
nu modifică release-urile sau drepturile SQL. Comanda autorizabilă în această
etapă este numai: sudo python3 -B tenant-os-executor.py --check-only.
Rezultat așteptat: OS_EXECUTOR_CHECK_ONLY_OK și
NO_ACCOUNT_NO_GROUP_CREATED_NO_SQL_NO_RESTART.

Șapte teste Python ale executorului, plus cele șase ale inventarului: trecute.
Testele de execuție sunt cu porturi fictive, nu useradd pe Windows/Linux.
