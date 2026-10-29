# Bilet temporar pentru verificarea adaptorului — numai local

Migrarea 012 depinde de 011 și nu acordă drepturi. Creează tabelul de bilete și
procedura issue/consume. Nu instalează login, servicii sau credențiale.

Workerul generează separat un token aleator de 32 bytes (64 caractere hex).
Issue cere lease-ul curent deținut de USER_NAME, revizia/generația și o intenție
înregistrată de același proprietar. Biletul este legat de intenție, job și revizie.
SQL păstrează numai hash-ul tokenului, ora proprie și actorul. Durata este fixă,
10 secunde; retry identic nu prelungește termenul. Alt token sau revizie este
conflict, iar un bilet expirat/consumat nu este reemis automat.

Consume primește numai intentId și ticketToken, nu leaseToken sau parola
workerului. Este permis numai principalului SQL infraflow_demo_adapter_review,
cu revalidarea jobului/companiei, generației, reviziei, proprietarului lease-ului,
expirării lease-ului și biletului. Consumarea este atomică și înregistrează actorul
și ora SQL; o retrimitere nu primește succes din nou.

Receipt-ul NU întoarce token, hash sau credențiale. executionAllowed rămâne false.
Nu se folosește biletul drept permisiune de creare OS/SQL. Verificarea în SQL nu
reprezintă fencing atomic pentru un efect ulterior în sistemul de operare.

Identitatea de review existentă este doar planificată, iar politica ei strictă
din adapter-review-policy.js acceptă încă exclusiv procedura de consultare 011.
Nu este extinsă tacit pentru 012: este necesară o politică/versionare și probe cu
login real înainte de montarea noului protocol. Workerul are nevoie de autorizare
explicită pentru intenții și issue; loginul lease actual nu este modificat aici.

Nu există transport de token montat, executor privilegiat sau reconciliere a
efectelor externe în acest increment. Schema VPS rămâne la 009.

## Probe locale

133 teste Node trecute și audit cu 602 fișiere fără constatări. Testul static a
semnalat inițial lipsa condiției explicite consumed_at IS NOT NULL în ramura
consumată a constrângerii. Condiția a fost adăugată înainte de aplicarea 012 în
fixture, pentru a evita acceptarea UNKNOWN de către CHECK la combinații NULL.

Proba SQL INFRAFLOW_TEST_TRIALS_94337CC13986: opt grupuri trecute, passed=true,
cleanup=true. Două consumări concurente au avut exact un succes și un refuz;
actorul worker nu poate consuma, tokenul greșit și reemiterea după consum sunt
refuzate. Expirarea simulată de administratorul fixture-ului refuză consumarea;
această modificare de timp nu este instrument de operare livrat. Citirea directă
a tabelului de bilete este refuzată. Jobul a fost eliberat cu execution_ready=0.

Probele folosesc utilizatori SQL WITHOUT LOGIN într-o bază temporară, nu loginuri
autentificate pe VPS. Transportul protejat, politica identității nou extinse,
revocarea prin reînnoirea lease-ului și reconcilierea efectelor externe rămân
acceptanțe distincte înaintea oricărei execuții reale.
