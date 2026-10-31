# Migrarea 014 — pregătire durabilă a delegării OS

Inventarul VPS a confirmat rezervarea SQL și absența utilizatorului/grupului
ift_b1100b4348d042fa8a1d73b1286f. Nu s-a creat contul și jobul rămâne queued/5/2.

014 adaugă exclusiv două tabele și un RPC de pregătire. Nu acordă drepturi,
nu înregistrează intenții sau delegări la instalare și nu modifică jobul.
Adaptorul review existent nu este promovat la root. Schema permite momentan
doar state=prepared și orice receipt are executionAllowed=false.

RPC-ul viitorului worker verifică lease-ul propriu, generația/revizia, intenția
os_identity, compania neactivată, manifestul și rezervarea canonică derivată din
UUID. Comparațiile între JSON/rezervări sunt BIN2 explicite. Timpul SQL este
recitit după obținerea lock-ului, înainte de validarea expirării.
Stochează numai hash-ul tokenului de delegare, termenul lease-ului și actorii SQL.
Auditul se scrie în aceeași tranzacție; eșecul auditului anulează pregătirea.
Replay-ul exact păstrează rândul și termenul; token/revizie diferite ori lease
eliberat/expirat sunt refuzate. Nu există adoptare de efecte OS.

## Ce NU este încă disponibil

014 nu autorizează useradd. Urmează consumul distinct sub identitatea executorului,
jurnalul rezultatului și reconcilierea efectului extern. Acea etapă va verifica
din nou lease/generație și va trata separat incertitudinea SQL versus OS.
Nu promitem atomicitate între SQL și sistemul de conturi Linux.

## Livrare

Pachet separat cu migrare, preflight numai citire, backup COPY_ONLY/CHECKSUM și
VERIFYONLY. Ordine: hash, preflight, backup verificat, confirmare, migrare,
verificare metadate. Nu necesită restart ERP/platformă. Nicio parolă în pachet.

## Verificări locale confirmate

162 teste Node trecute; audit advisory 619 fișiere, zero constatări.
Probe SQL native INFRAFLOW_TEST_TRIALS_3740CD4D594C și
INFRAFLOW_TEST_TRIALS_9276012C5BD0: passed=true, cleanup=true, opt grupuri fiecare.
A doua probă include refuzul unui nume din manifest cu spațiu la final prin
verificarea lungimii în octeți (egalitatea SQL singură ignoră spațiile finale).
Testate audit rollback, replay exact fără dublare, token diferit refuzat,
citire directă refuzată și lease eliberat refuzat. Niciun efect OS executat.
