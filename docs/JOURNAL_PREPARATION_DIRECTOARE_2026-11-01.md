# Jurnal separat pentru un singur apel prepare

Implementare locală: scripts/linux/directory-preparation-journal.py.
Fără CLI și fără port SQL/OS implicit. Primește bindingul unei intenții și
unui lease deja pregătite; nu poate claim/release/renew sau crea directoare.

Bootstrap privat înaintea apelului SQL: binding exact, leaseToken și
attemptToken distincte. Director nou root700 numit după attemptId, fișiere
root600 O_EXCL/NOFOLLOW, fsync fișier și părinte; folosește helperul existent.
Nu imprima bootstrapul: conține tokenuri. Hash-chain-ul nu apără împotriva root.

Ordine durabilă created → prepare_requested → prepared. Rezultat incert:
review_required dacă jurnalul încă poate fi scris; în caz contrar rămâne
prepare_requested. În niciun caz retry, release compensatoriu sau ștergere.
Un director de încercare existent este refuzat, fără reluare/adoptare.

run_once validează receiptul din nou: binding, proprietari, căi canonice,
prepared și executionAllowed strict false. Returnează doar attemptId și
prepared_requires_review, executionAllowed/resumeAllowed false. Nu autorizează
operații OS și nu înlocuiește jurnalul de mkdir.

Teste: ordine înaintea RPC, răspuns pierdut fără retry, eșecul scrierii care
previne RPC, input invalid fără jurnal și fișiere native exclusive/private.
Proba nativă utilizează doar un director temporar propriu în /run, curățat
de fixture; nu creează conturi sau resurse tenant. Nicio probă SQL reală aici.

Nu este livrat pe VPS. Înainte de ciclul real mai trebuie conectate lease-ul,
intenția, bindingul brokerului și inspecția read-only a jurnalului; acestea
nu sunt presupuse implementate de acest pas.
