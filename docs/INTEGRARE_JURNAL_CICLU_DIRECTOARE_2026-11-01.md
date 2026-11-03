# Ciclu SQL și jurnal durabil — integrare locală

Fișiere noi: directory-cycle-journal.py, directory-cycle-orchestrator.py,
directory-cycle-bound-ports.py. Nicio lansare implicită, CLI sau operație pe VPS.

Bootstrap înainte de pornirea pipe-ului: job/trial, dovadă OS anterioară,
UID/GID, revizie așteptată, UUID noi pentru intent/attempt și tokenuri distincte.
Conține secrete; nu îl imprima. Director root700 per job, fișiere root600
exclusive cu fsync, hash-chain și reverificare la append. Nu poate fi reluat.

Nouă etape: created, claim_requested, claimed, intent_requested,
intent_recorded, prepare_requested, prepared, release_requested, released.
Fiecare cerere se scrie durabil înainte de RPC. Receipturile se verifică din
nou la nivelul coordonatorului. Release se face numai după receipt prepared
confirmat, pentru acest ciclu SQL-only fără operații pe directoare.

La eroare: review_required dacă jurnalul permite; altfel ultima cerere rămâne
marcată. Nu se repetă cererea, nu se compensează cu release și nu se șterge.
Inspecția read-only validează lanțul și returnează doar identificatori și
starea de review, fără tokenuri; resumeAllowed este întotdeauna false.
Hash-chain-ul nu protejează împotriva administratorului root de încredere.

Porturile legate creează jurnalul înainte de pipe/init și închid întotdeauna
pipe-ul propriu. Factory-ul pipe este obligatoriu și explicit; lansatorul
systemd pentru acest broker de ciclu nu este încă implicit sau instalat.

Verificări curente: patru teste simulate trecute pe Windows, compilare Python
și diff-check trecute. Testul nativ root Linux (al cincilea) a fost sărit pe
Windows. WSL Ubuntu nu a putut porni la două încercări: CreateVm/WSAENOTCONN;
testul nativ al noului jurnal rămâne NEVALIDAT. Nu s-au schimbat setări WSL,
nu s-au oprit servicii și nu s-a pregătit un pachet de execuție pentru VPS.
