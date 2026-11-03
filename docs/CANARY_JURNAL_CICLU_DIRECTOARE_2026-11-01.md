# Probă nativă a jurnalului, fără SQL

Comandă numai după SHA și confirmare:
sudo python3 scripts/linux/probe-demo-directory-cycle-journal-canary.py --run-canary-confirmed

Solicită root Linux. Toate porturile SQL și pipe sunt simulate de test; nu
importă driverul MSSQL, nu citește parole și nu lansează systemd. Nu creează
identități OS, baze de date sau directoare tenant. Singurele scrieri sunt
într-un director temporar nou /run/infraflow-dir-cycle-<random>, creat root700
de fixture și eliminat de TemporaryDirectory la ieșire, inclusiv la eșec.
Nu șterge directoare existente și nu are opțiune de reluare.

Testează întregul wiring/coordonator cu jurnalul real root600/fsync/hash-chain,
nouă evenimente, inspecție fără tokenuri și refuzul recreării aceluiași jurnal.
Teste suplimentare simulate: ordine înainte de fiecare cerere, răspuns pierdut
fără compensare, eșecul durabilității înaintea RPC și inventar refuzat.

Succes numai dacă toate cele cinci teste trec și niciunul nu este sărit.
Mesajele de succes nu înseamnă că s-a rulat ciclul SQL real sau că directoarele
tenant au fost create. Proba WSL nu a putut fi executată din cauza erorii
CreateVm/WSAENOTCONN; această probă este alternativa Linux controlată.
