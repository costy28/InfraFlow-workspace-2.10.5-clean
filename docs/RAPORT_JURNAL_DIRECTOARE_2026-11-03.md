# Proiecția jurnalului de execuție în raportul SQL

Componentă privată demo; versiunea ERP nu se modifică.

## Implementat local

`scripts/linux/tenant-directory-execution-journal.py` introduce un format v2 separat de jurnalul anterior. Manifestul leagă politica directoarelor și dovada identității OS de job, trial, intenție, încercare, generație, revizie, UID și GID.

Proiecția este numai citire: nu autorizează execuție și nu trimite SQL. Acceptă exclusiv cele 17 evenimente complete (cerere și observație pentru fiecare dintre cele opt directoare, apoi finalizare), cu lanț de hash-uri valid și observații conforme politicii. Refuză încercări diferite, jurnale incomplete, observații duplicate și valori în afara uint64. Device/inode sunt transmise ca șiruri zecimale pentru a evita pierderea preciziei în JavaScript.

Tokenul încercării nu este inclus în raportul proiectat. Transportul autorizat trebuie să îl adauge separat.

## Limite și continuare

- Testele portabile verifică proiecția; nu înlocuiesc verificarea nativă a fișierelor și nici un apel SQL real.
- Este necesar un test nativ al noului jurnal, urmat de integrarea cu brokerul executorului.
- Trimiterea raportului trebuie precedată de o înregistrare durabilă separată: jurnalul OS finalizat nu poate fi extins după evenimentul terminal.
- Pierderea răspunsului SQL impune verificare manuală, fără reîncercare sau raport alternativ automat.
- Încercarea pilot din generația 4 este eliberată și nu poate autoriza crearea directoarelor. O execuție reală necesită o încercare nouă și context SQL valid.
- Directoarele comune deja existente necesită un flux explicit de observație; `shared_verified` nu este tratat ca `observed_created`.

Nicio modificare VPS, creare de directoare tenant sau activare nu este efectuată de această componentă locală.

## Coordonarea trimiterii (local)

`tenant-directory-report-submit.py` citește proiecția validată și cere persistarea exclusivă a cererii înainte să apeleze transportul injectat (`send('report', payload)`). Porturile native folosesc un director separat per încercare, fișiere private exclusive și fsync. Existența directorului refuză repetarea, inclusiv după întrerupere. Tokenul este transmis numai transportului, nu jurnalului.

Confirmarea se scrie separat numai dacă răspunsul coincide exact cu legăturile și digestul așteptate. Erorile de transport, răspunsul incorect sau eșecul persistării confirmării impun verificare manuală. Nu există fallback, release sau retry automat.

Patru teste locale cu transport/persistare simulate verifică ordinea, eșecul discului înainte de trimitere, pierderea răspunsului și refuzul unei confirmări pentru altă generație. Integrarea nativă a acestor porturi cu brokerul real rămâne de verificat; niciun apel SQL real nu a fost executat în acest pas.
