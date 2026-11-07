# Guard context înainte de fiecare mkdir — local, porturi explicite

tenant-directory-context-guard.py leagă planul canonic de job/trial/intentie/
OS intent anterior/attempt/generație/revizie/UID/GID și aprobarea root explicită.
SQL executionAllowed rămâne false; nu este convertit într-o aprobare OS.
Modulul nu selectează SQL, lock sau runner implicit și nu are CLI.

Ordine sub lockul identității, pentru fiecare cale absentă:
1. run_plan scrie durabil mkdir_requested.
2. Guardul cere contextul live și validează toate câmpurile și căile.
3. Scade integral latența apelului din bugetul SQL15–60sec; cere >=12sec.
4. Înainte de runner cere >=7sec și furnizează timeout5sec.
5. Refuză rezultat dacă runnerul depășește5sec sau rămân <2sec.
6. run_plan validează observația și o scrie durabil.

Runnerul de încredere TREBUIE să aplice efectiv timeoutul și să dețină procesul
copil. Post-verificarea guardului nu poate întrerupe un syscall blocat. Runnerul
concret pentru directoare rămâne pas separat; _mkdir nu este instalat automat
ca runner de acest modul. Nicio garanție de timeout OS nu este pretinsă încă.

Context refuzat, modificat sau buget insuficient: niciun apel de creare.
Efect întârziat/răspuns incert: review_required, fără retry, ștergere sau
raport SQL alternativ automat. Jurnalul precedent rămâne dacă scrierea review
nu mai funcționează. Un context SQL valid nu blochează atomic expirarea lease
în timpul unui syscall; observația tardivă nu este raportată drept succes.

Cinci teste simulate trecute: opt contexte proaspete în ordinea durabilă,
binding/expirare/latență refuzate, efect tardiv fără retry, aprobare locală
obligatorie și fsync eșuat înainte de orice context/efect. Niciun director,
SQL sau cont real atins. Nu este livrat pe VPS și nu reutilizează încercarea
generație4 eliberată.
