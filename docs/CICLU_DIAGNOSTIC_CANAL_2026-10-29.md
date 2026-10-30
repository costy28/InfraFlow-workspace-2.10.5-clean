# Ciclu diagnostic al canalului — implementare locală

Platformă privată separată de ERP; nu schimbă versiunea sau pachetele ERP.

## Implementare

1. channel-review-sql.js utilizează identitatea infraflow_demo_lease cu exact
   trei RPC-uri. Reutilizează verificarea de identitate a transportului de bilete.
   Transportul vechi provision-lease-sql.js, cu un singur drept, rămâne neschimbat.
2. Portul nou permite claim/verify/release, intenție exclusiv channel_review_probe
   și emitere de bilet. Nu permite renew, consume, pașii reali, SQL sau ținte arbitrare.
3. channel-review-cycle.js execută o singură secvență: scope, claim, intent,
   issue, consume prin portul canalului, verify, release. Tokenurile aleatoare
   rămân numai în memorie și parametri, nu în rezultat sau mesaje de eroare.
4. Orice eroare sau receipt incompatibil oprește secvența. Nu există retry ori
   release compensator după rezultat incert. Lease-ul și auditul se verifică
   separat, fără ștergerea intențiilor sau biletelor.
5. Nu se face renew între issue și consume: schimbarea reviziei ar invalida biletul.

## Limite și validare

158 teste Node ale platformei au trecut; audit advisory 616 fișiere, zero findings.
Testele includ oprirea la fiecare etapă, refuzul unui receipt de execuție,
substituirea jobului/generației, scope SQL prea larg, concurență și shutdown.

Proba nativă separată folosește o bază SQL sintetică și EXECUTE AS USER.
Ea validează ciclul și procedurile reale, nu autentificarea nativă a noului
transport și nici SO_PEERCRED/systemd/Unix pe Windows.

Rezultat nativ confirmat: INFRAFLOW_TEST_TRIALS_BFA11E001587, opt grupuri trecute,
passed=true și cleanup=true. Ciclul a lăsat jobul queued/revizie 2/generație 1,
execution_ready=0, o intenție diagnostică și un bilet consumat. O cerere cu
revizie veche s-a oprit la claim. Baza temporară a fost eliminată de fixture.

Nu există încă un pachet de instalare sau o comandă autorizată de rulare pe VPS
pentru acest ciclu. Urmează entry point-ul Linux cu LoadCredential și launcher-ul
temporar al canalului; apoi testul real, cu confirmare separată înainte de claim.
Niciun serviciu existent, parolă sau job VPS nu a fost modificat în acest pas.
