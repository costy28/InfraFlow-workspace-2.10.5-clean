# Proba completă worker → Unix → adaptor → SQL

Proba de montare reală a fost confirmată de utilizator: lazy start, root refuzat,
cleanup OK, fără RPC/job/bilet. Următorul launcher folosește codul deja staged.

Necesită confirmare distinctă: --complete-cycle-confirmed. Nu rulează la import.
Prima operație worker SQL este claim cu revizia exactă 3 a jobului pilot.
Ținta așteptată după succes: queued, revizie 5, generație 2, fără lease;
o intenție channel_review_probe și un bilet consumat. execution_ready rămâne 0.
Nu se creează o instanță și nu începe perioada de 15 zile.

Launcher-ul pornește doar unități tranzitorii absente inițial, cu LoadCredential,
folosește receptorul real și clientul Node Unix, apoi oprește unitățile proprii.
Nu repornește platforma/ERP și nu modifică parole sau schema SQL.

La rezultat incert nu există retry ori release compensator. Jobul poate rămâne
leased până la expirare, cu intenție/bilet persistate. Oprirea unităților nu este
rollback SQL. Nu relua launcher-ul; inspectează starea SQL în citire.
Succesul launcher-ului necesită separat verificarea SQL a rezultatului durabil.

Pachetul conține launcher-ul, helper-ul de montare și această notă. Nu modifică
release-ul adapter-channel-v1. Testele locale nu înlocuiesc proba Linux reală.
