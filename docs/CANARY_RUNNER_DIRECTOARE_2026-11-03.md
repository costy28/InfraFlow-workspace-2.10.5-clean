# Probă nativă runner + guard + jurnal, fără tenant real

Comandă numai după SHA și confirmare:
sudo python3 scripts/linux/probe-demo-directory-runner-canary.py --probe-confirmed

Root Linux, director nou privat /run/infraflow-directory-runner-<random>.
Toate căile canonice sunt mapate NUMAI în acest fixture. Copiii folosesc
primitivele descriptor/no-follow reale, chown numeric60001/60002 fără creare
conturi, timeout5 și observații reale. Nu se folosește create_runner cu căi
tenant reale: numai _capture_owned cu cod canary fix și intrare mapată.

Scenarii:
1. Opt directoare temporare, opt contexte simulate proaspete, lock real,
   jurnal privat/fsync/hash-chain real și observarea proprietarilor/modurilor.
2. Context expirat: zero efecte și review_required.
3. Răspuns pierdut după primul efect: directorul rămâne în fixture pentru
   verificarea testului, nicio reluare sau compensare, review_required.
4. Copil benign care pornește un descendent adormit: timeout, SIGKILL numai
   grupului creat și verificarea că descendentul nu mai rulează. Un zombie
   deja mort în așteptarea reap de către init nu este considerat proces viu.

Fixture-ul TemporaryDirectory se curăță la ieșire, inclusiv la eșec. Nu șterge
resurse existente și nu are opțiune de retry. Succes numai dacă toate scenariile
și cleanup trec. La eroare nu relua; inspectează diagnosticul separat.

Nu importă driver SQL, nu citește parole, nu face RPC, nu atinge joburi,
directoare tenant, conturi sau servicii existente. Proba nu validează încă
SQL live sau protocolul de rezultat SQL. Codul copilului de producție și
validarea căilor sale root rămân distincte de mappingul temporar al canary-ului.

Verificări locale: sintaxă Python, patru teste simulate runner și cinci guard
trecute. Proba nativă a acestei versiuni este ÎNCĂ NEVALIDATĂ până la rezultatul
real Linux de pe VPS.
