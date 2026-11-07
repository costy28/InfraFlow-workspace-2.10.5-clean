# Runner proprietar al procesului pentru directoare — local

tenant-directory-owned-runner.py și tenant-directory-child.py: un singur copil
root Linux, o singură operație mkdir pe plan canonic și index0–7. Nicio cale
independentă sau comandă shell nu este acceptată. Copilul revalidează întregul
plan și folosește primitivele descriptor/no-follow existente.

Runnerul primește explicit child_file în cod de încredere și verifică root/
fără scriere group-other/symlink pe executabilul Python rezolvat, copil și
dependințele plan/executor. Nu este selectat automat de guard și nu are CLI.

Popen start_new_session creează grupul propriu. communicate are timeout5sec;
la timeout/întrerupere SIGKILL numai pe grupul copilului creat, apoi așteaptă
până la3sec pentru închiderea pipe-urilor. Dacă nici cleanup nu poate fi
confirmat, cere review; nu pretinde că un proces blocat în kernel a dispărut.

Intrare <=4096 bytes, fără parole. Copilul de încredere emite o singură
observație JSON; părintele acceptă numai rezultat<=2048 bytes și forma strictă.
communicate colectează stdout înainte de verificarea dimensiunii; protecția
împotriva outputului nelimitat depinde de codul copilului root de încredere,
nu este un sandbox pentru executabile arbitrare. Stderr nu este expus.

Timeout sau rezultat pierdut poate lăsa directorul creat. Nicio ștergere,
adoptare, reluare sau raportare automată alternativă. Jurnalul mkdir_requested
și verificarea contextului rămân responsabilitățile guardului/coordonatorului.

Patru teste cu procese simulate trecute: lansare proprietară, timeout și
reap, output invalid fără retry și input invalid înainte de spawn. Cinci
teste guard trecute separat. Sintaxa Python verificată. Proba nativă Linux
și integrarea pe directoare temporare sunt ÎNCĂ NEVALIDATE pentru acest runner.
Nicio resursă tenant/VPS modificată și niciun pachet de execuție livrat.
