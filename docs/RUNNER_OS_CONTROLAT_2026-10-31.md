# Runner OS cu timeout și grup de procese propriu

Componentă privată, fără CLI de creare. Portul `create_command_runner` acceptă
numai cele două comenzi canonice obținute din planul tenantului: groupadd și
useradd, cu argumentele deja validate. Refuză alte comenzi, liste în loc de tuple,
timeout diferit de 5 secunde sau execuția fără root pe Linux. Înaintea fiecărei
comenzi verifică binarul și părinții lui, fără symlink sau scriere de către alții.

Runnerul pornește propriul proces într-o sesiune nouă, fără shell, cu stdin și
ieșirile închise și mediu minim. La timeout trimite SIGKILL numai grupului creat
prin acel obiect Popen și așteaptă terminarea procesului propriu. Nu enumeră PID-uri,
nu omoară procese după nume și nu reia comanda. Un eșec rămâne incert și necesită
reconciliere; nu se încearcă ștergerea unui grup sau utilizator parțial creat.

## Proba din arhivă

Arhiva include doar runnerul, canary-ul și acest document. Nu instalează un
serviciu, nu montează executorul real și nu schimbă SQL sau credentiale.

`sudo python3 -B scripts/linux/probe-demo-os-owned-runner.py --probe-confirmed`

1. Execută `/usr/bin/true` pentru calea normală.
2. Într-un director temporar propriu sub `/run`, pornește un proces Python care
   face fork; ambii păstrează deschis un lock de fișier.
3. Timeout-ul trebuie să oprească grupul. Proba poate lua apoi același lock,
   demonstrând că nu a rămas copilul cu lock-ul deschis.
4. Curăță doar directorul propriu temporar. Nu există comenzi de conturi/NSS/SQL.

Markeri: `OS_OWNED_RUNNER_SUCCESS_OK`, `OS_OWNED_RUNNER_TREE_TIMEOUT_OK`,
`OS_OWNED_RUNNER_CANARY_CLEANUP_OK`.

Helperul intern `_run_owned` este folosit de canary numai cu argv fixe și benign.
Nu este endpoint, parser de comenzi din browser sau CLI de execuție arbitrară.
Portul de producție rămâne fără CLI și nu este activat prin această probă.

## Validare și limite

Testele locale verifică sesiunea privată, mediul minim, argumentele fixe, refuzul
timeout-urilor arbitrare, SIGKILL pe grupul propriu, așteptarea terminării și lipsa
reluării. Testele rulează cu porturi simulate pe Windows; proba reală Linux rămâne
de executat pe VPS. Nu reprezintă o creare de utilizator demo sau o activare.

Rezultate: 179 teste Node trecute, 16 teste Python pentru runner/gardă/executor
trecute; auditul de expunere nu a detectat probleme.
Referințe oficiale: [Python subprocess](https://docs.python.org/3/library/subprocess.html#subprocess.Popen)
și [Python os.killpg](https://docs.python.org/3/library/os.html#os.killpg).

Root și binarele sistemului rămân de încredere. SQL și OS nu sunt o tranzacție
atomică. Runnerul trebuie folosit sub blocarea identității și verificările proaspete
de context deja implementate; utilizarea izolată nu acordă autoritate de execuție.
