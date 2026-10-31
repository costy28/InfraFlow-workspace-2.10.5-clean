# Asamblare pilot OS — lucru local, fără execuție pe VPS

## Stare confirmată de operator

Proba transportului SQL pe VPS a confirmat metadatele ambelor roluri, refuzurile între roluri și oprirea serviciilor tranzitorii. Nu a preluat jobul și nu a scris în SQL.

## Increment local

`scripts/linux/os-pilot-bound-ports.py` leagă porturile orchestratorului la clientul privat SQL. Jurnalul bootstrap este creat înainte de deschiderea proceselor SQL. Executorul este inițializat doar pe binding-ul primit după claim. Contextul este transmis către portul host ca funcție, nu ca autorizație permanentă. La ieșire sunt închise canalele în ordine inversă; nu există release/report de compensare.

Nu există CLI de aplicare și nici port host implicit. Inventarul, jurnalul și host-ul trebuie furnizate explicit de un apelant privilegiat verificat.

`scripts/linux/tenant-os-observer.py` verifică numai citire NSS: numele exact, UID/GID pozitive, grup primar concordant și fără membri expliciți, fără grupuri suplimentare, home `/nonexistent` absent, shell `/usr/sbin/nologin` și parolă shadow blocată. Nu returnează câmpurile parolelor. Observarea nu dovedește proveniența contului: inventarul absent înaintea comenzilor și jurnalul încercării rămân obligatorii. Nu se adoptă conturi existente.

Teste locale: 4 pentru observator, 4 pentru legături și oprire pe erori; regresii orchestrator 6 și jurnal 5 trecute. Testele noi folosesc porturi simulate; nu probează NSS/systemd real și nu creează conturi.

## De terminat înaintea primei creări reale

1. Test complet al legăturilor cu toate răspunsurile și contextul: trecut local prin porturi simulate, inclusiv pierderea răspunsului la intent/prepare/accept/context/report/release. Ambele canale sunt închise; nu există operații compensatorii.
2. `os-pilot-host-port.py` asamblează lock, guard, runner și observator. Constructorul nu execută comenzi. Apelul este unic, legat de job/trial/revizie și consumat inclusiv la eroare. Rezultatul observatorului se întoarce orchestratorului, care jurnalizează înaintea raportării SQL. Trei teste simulate trecute; verificarea Linux a ansamblului rămâne de făcut.
3. Preflight SQL curent și jurnal root protejat pentru încercarea pilot.
4. Confirmare separată a primei creări OS. Nu se activează automat trialul sau cele 15 zile.

Niciun pachet nou livrat în acest increment; ERP rămâne neatins.

## Probă integrată Ubuntu WSL — confirmată local

`scripts/linux/probe-demo-os-assembled-canary.py --probe-confirmed` a trecut în Ubuntu 24.04.5 local.

- Flux complet prin `os-pilot-bound-ports` și `os-pilot-host-port` cu orchestrator/jurnal/guard/lock reale.
- Transportul SQL, inventarul NSS și observația contului sunt explicit simulate, fără parole și fără conexiuni SQL.
- Runnerul real primește numai `/usr/bin/true`, după verificarea că cererea inițială corespunde uneia dintre cele două comenzi canonice. Nu lansează useradd/groupadd.
- Contextul refuzat oprește înaintea oricărei comenzi.
- Eșecul observației după două comenzi benigne produce `review_required`, fără report/release de compensare.
- Ambele canale simulate sunt închise, jurnalul interzice reluarea, iar directoarele proprii temporare din `/run` sunt curățate.

Markeri: `OS_ASSEMBLED_BENIGN_DURABLE_FLOW_OK`, `OS_ASSEMBLED_CONTEXT_REFUSAL_NO_COMMAND_OK`, `OS_ASSEMBLED_OBSERVATION_FAILURE_NO_COMPENSATION_OK`, `OS_ASSEMBLED_CANARY_CLEANUP_OK`.

Aceasta nu dovedește crearea unui cont real, observarea NSS reală sau un ciclu SQL complet prin systemd. Înaintea primei execuții rămân verificarea acestor frontiere, starea SQL curentă și aprobarea explicită.
