# Primul pas real: identitatea OS a trialului

## Punct de plecare confirmat de utilizator

Ciclul complet a reușit pe VPS. SQL: job queued, revizie 5, generație 2,
execution_ready=0, fără lease; o intenție channel_review_probe intent_recorded
în generația 2; un bilet consumat. Nu reluăm proba pe același job.

## Contract de creare restrâns (încă neautorizat pentru execuție)

Numele rezultă din trial UUID, conform manifestului SQL și rezervării os_identity:
`ift_b1100b4348d042fa8a1d73b1286f` pentru utilizator și grup.
Cont de sistem, home /nonexistent fără creare home, shell /usr/sbin/nologin,
fără grupe suplimentare și fără autentificare cu parolă. UID/GID sunt alocate
de OS, nu alese de browser sau derivate dintr-un UID existent.

Un cont/grup existent, chiar aparent identic, nu se adoptă. Crearea parțială
(grup existent după eșec la utilizator) cere reconciliere durabilă și verificare
de proveniență. Nu ștergem conturi pentru a permite un retry.

## Limita autorității

Nu transformăm un receipt executionAllowed=false în autoritate root. Înaintea
executorului real sunt necesare delegarea durabilă distinctă pentru os_identity,
legarea job/trial/resursă/intention/generație, verificarea lease-ului și un jurnal
de rezultat/reconciliere. Tranzacția SQL nu poate face useradd atomic cu SQL.
Niciun RPC sau parametru browser nu va primi comandă shell, UID, grup sau cale.
Adaptorul review actual rămâne neprivilegiat; nu îl transformăm în root.

## Pachetul acestei etape

inspect-demo-tenant-os-identity.py --inspect-only verifică NSS pentru numele fix
al pilotului cu getent passwd/group. Nu execută useradd/groupadd/usermod, nu
citește parole și nu execută SQL. Un rezultat absent nu este autoritate de creare.
Orice cod neașteptat sau rezultat ambiguu este refuzat. Un conflict nu este eliminat.

Urmează verificarea SQL în citire a rezervării, corelată cu inventarul OS actual.
Execuția reală va avea un pachet și o confirmare separate, după delegarea durabilă.

## Corecție v2 pentru verificarea SQL

VPS a raportat Msg 468 la comparația JSON_VALUE(resource_manifest) cu resource_key.
Manifestul moștenește collation-ul implicit, iar rezervarea are BIN2 explicit.
v2 aplică Latin1_General_100_BIN2 pe ambele expresii, fără ALTER DATABASE/coloane.
Scriptul rămâne numai în citire. Blocul v1 cu set -e nu a ajuns la inventarul OS.

Regresie nativă: INFRAFLOW_TEST_TRIALS_6E9CD8346883, passed=true/cleanup=true:
forma veche reproduce 468; forma corectată trece; diferența de majuscule este
refuzată cu 53802. Cele șase teste Python ale inventarului trec.
Toate fixture-urile temporare create la depanarea probei au fost eliminate;
nu s-au efectuat modificări pe VPS în această corecție.
