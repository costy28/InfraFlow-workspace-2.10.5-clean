# Directoare tenant — politică și inventar înainte de creare

## Etapa OS precedentă confirmată pe VPS

Trial b1100b43-48d0-42fa-8a1d-73b1286f8242, identitate ift_b1100b4348d042fa8a1d73b1286f, UID 992 / GID 983.
Intent 40f385e6-c722-429a-a8fe-46c6119c4834, observed_created în SQL, executor dedicat, job queued revizie 7 / generație 3, fără lease. Jurnal released, 15 evenimente, fără reluare. Trial neactivat.

Aceste rezultate sunt confirmate de utilizator, nu prin conectare automată a agentului la VPS.

## Politică propusă

| Director | Proprietar | Mod |
|---|---|---|
| /var/lib/infraflow-demo-tenants | root:root | 0711 |
| /etc/infraflow-demo-tenants | root:root | 0711 |
| /var/lib/infraflow-demo-tenants/TRIAL | 992:983 | 0700 |
| /etc/infraflow-demo-tenants/TRIAL | root:983 | 0750 |
| storage/TRIAL/data, uploads, logs, tmp | 992:983 | 0700 |

Părinții comuni permit traversare, nu listare pentru alți utilizatori. Tenantul poate scrie datele proprii, nu configurația root. Cheile, parolele și fișierele de configurare nu sunt create în această etapă.

Inventarul refuză symlink-uri și strămoși modificabili de grup/alții. Numai părinții comuni pot exista deja, dacă au proprietar/mod exact. Orice cale tenant existentă cere verificare; nu se adoptă automat.

## Pachet numai de inventar

`probe-demo-tenant-directories.py --inspect-only`, root Linux: revalidează contul prin observatorul root deja instalat, UID/GID 992/983 și jurnalul released exact. Inspectează cele opt căi canonice, afișează numai politica și rezultatele fără tokenuri. Nu creează directoare și nu accesează SQL.

Patru teste de plan/politică au trecut pe Windows și Ubuntu WSL. Proba completă a inventarului cu identitatea reală rămâne pentru VPS: contul pilot nu a fost creat în laboratorul local.

## Următorul pas de implementat

Pasul directoarelor are nevoie de propriul jurnal durabil și de corelarea rezultatului cu dovada OS confirmată. Transportul OS precedent este intenționat limitat la os_identity; nu îl extindem implicit și nu reluăm claim-ul/crearea identității. Nu există încă în acest pachet o comandă de creare sau o migrare SQL. Perioada de 15 zile rămâne nepornită.

## Executor și jurnal implementate local ulterior inventarului

`tenant-directory-executor.py` are un flux cu porturi injectate, fără CLI sau autorizație implicită. Cere inventar exact și autorizație explicită pentru fiecare creare; scrie cererea în jurnal înaintea efectului, apoi rezultatul observat. Erorile opresc, fără retry/adoptare/ștergere.

Primitiva internă folosește descriptori de directoare, `O_NOFOLLOW`, mkdir exclusiv, fchown/fchmod pe descriptor și fsync pentru director și părinte. Refuză ACL POSIX pe cale, symlink-uri, părinți nesiguri și proprietari/moduri diferite. Nu se folosește shell sau mkdir -p.

`tenant-directory-journal.py` păstrează manifestul politicii și referința la dovada OS anterioară într-un director root 0700, fișiere root 0600, exclusive și fsync. Evenimentele sunt secvențiale, hash-linked și validate la citire. Nu permite reluare automată, nici măcar după completed. Hash-urile nu protejează împotriva administratorului root de încredere.

Probe locale: 5 teste pentru flux și tranziții; canary nativ Ubuntu WSL pentru opt directoare mapate EXCLUSIV într-un `/run/infraflow-dir-executor-canary-*` privat, cu chown numeric 60001/60002 (fără conturi create), permisiuni, jurnal real, refuz EEXIST/symlink și răspuns pierdut. Curățarea acestor fixture-uri temporare a fost confirmată. Acest canary nu este proba căilor finale de pe VPS și nu folosește SQL.

Rămâne protocolul SQL/audit pentru pasul directoarelor și legarea lui de rezultatul OS confirmat. Nu există încă pachet de aplicare pe VPS pentru aceste componente; arhiva de inventar v1 rămâne neschimbată.
