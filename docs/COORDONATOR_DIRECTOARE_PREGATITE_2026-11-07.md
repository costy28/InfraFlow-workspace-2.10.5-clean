# Coordonator pentru o încercare proaspăt pregătită

`scripts/linux/directory-prepared-execution.py` leagă porturile existente: broker executor inițializat pe binding, metadate, inventar cu toate cele opt căi absente, guard cu context înaintea fiecărui efect, jurnal v2 și trimitere cu cerere durabilă.

Nu are CLI, transport implicit, claim, release sau activare. Porturile privilegiate trebuie furnizate de un wrapper root verificat. Tokenul rămâne în memorie/transport, fără ieșire în rezultat. Pipe-ul se închide la succes și eroare. Nu se încearcă release, compensare sau retry la eroare.

Acest coordonator nu creează și nu reia un lease. Wrapperul viitor trebuie să păstreze lease-ul proaspăt pe durata execuției și a raportării, să folosească o nouă intenție/încercare și să înregistreze durabil pregătirea. Nu se poate folosi încercarea eliberată din generația 4.

Verificare locală: cinci teste de wiring cu guard, persistare și SQL simulate; separat cinci teste guard și patru teste trimitere. Nu reprezintă validare end-to-end nativă. Urmează integrarea cu porturile reale într-un test controlat, apoi wrapperul pilot cu preflight, backup și confirmare înainte de efecte reale. Versiunea ERP rămâne neschimbată.

## Canary integrat pregătit

`probe-demo-directory-prepared-integration.py --probe-confirmed` folosește exclusiv un director propriu temporar în `/run`. Jurnalul OS, jurnalul raportului și lock-ul sunt native; SQL, inventarul și efectele mkdir sunt simulate. Verifică durabilitatea înainte de fiecare cerere context și înainte de raport, context expirat fără efecte, răspuns raport pierdut fără confirmare și refuzul repetării unei încercări existente. Nu creează conturi, directoare tenant sau unități systemd. Nu constituie test SQL pozitiv sau test al copilului mkdir de producție. Rezultatul nativ trebuie confirmat separat pe VPS.
