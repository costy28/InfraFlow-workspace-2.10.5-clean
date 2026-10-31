# Prima identitate OS pilot — aplicare numai după confirmare

## Domeniu fix

- Companie Test InfraFlow, trial `b1100b43-48d0-42fa-8a1d-73b1286f8242`.
- Job `00f612ed-a8ac-4688-a26f-679760eee0be`, CAS revizie inițială 5.
- Creează grupul și utilizatorul `ift_b1100b4348d042fa8a1d73b1286f`, sistem, fără home creat, shell nologin și parolă blocată.
- Nu creează baza tenantului, nu pornește un ERP tenant, nu activează trialul și nu începe cele 15 zile.

## Ordine obligatorie pe VPS

1. Verificare SHA a arhivei și extragere într-un director nou.
2. `sudo python3 scripts/linux/apply-demo-os-first-identity.py --check-only`: fără SQL și fără citire de parole. Verifică inclusiv SHA-urile celor șapte fișiere broker deja probate pe VPS, identitatea worker, metadatele credentialelor, NSS, unități și destinații absente.
3. Preflight SQL `preflight-demo-os-pilot-final.sql` în baza platformei, cu SA interactiv. Confirmă queued/revizie 5/generație 2 și absența intențiilor/rezultatelor OS.
4. Backup prin `backup-demo-platform-pre-first-os.sql`, COPY_ONLY/CHECKSUM și VERIFYONLY. Nu este test de restaurare efectivă. Nu există restaurare automată.
5. Confirmare separată a utilizatorului în conversație înaintea comenzii de aplicare.
6. Numai apoi `sudo python3 scripts/linux/apply-demo-os-first-identity.py --apply-confirmed`, într-un terminal interactiv. Cere tastarea exactă a identității, nu parola SQL.

Pachetul nu cere sau transportă SA. Folosește credentialele existente worker/executor numai în servicii systemd distincte. SQL verifică drepturi, lease, revizie și context înaintea operațiilor; contextul se reverifică înaintea fiecărei comenzi OS.

## Persistență și oprire

Codul Python se copiază într-un release root 0700 nou, fișiere 0600. Jurnalul permanent `/var/lib/infraflow-demo-os-pilot` este root 0700; bootstrap-ul cu tokenurile încercării este root 0600 și nu trebuie afișat sau trimis în chat. Lock-ul este în `/run/infraflow-demo-os-pilot-locks` și nu este șters automat.

Succesul raportează `FIRST_OS_IDENTITY_RECORDED_REQUIRES_REVIEW`. În condițiile snapshot-ului confirmat, claim și release duc jobul la revizie 7, generație 3, queued, execution_ready 0; un rezultat OS observat este auditat. Intenția rămâne intent_recorded: nu reprezintă finalizarea provisioning-ului.

Orice eroare: `DO_NOT_RETRY_DO_NOT_DELETE_REVIEW_SQL_AND_PRIVATE_JOURNAL`. Pot exista grup/utilizator sau scrieri SQL chiar dacă răspunsul s-a pierdut. Nu se repetă scriptul, nu se adoptă contul, nu se execută userdel/groupdel și nu se restaurează backup-ul fără reconciliere. Procesul nu trimite raport sau release de compensare automat.

## Dovezi și limite

Au trecut testele locale ale orchestratorului, legăturilor și portului host, plus canary Linux cu jurnal/lock/runner reale și SQL/NSS simulate. Pe VPS au fost probate separat transporturile SQL și NSS absent. Pachetul de aplicare NU a fost executat pe cont real în pregătirea sa. Prima aplicare pilot este o schimbare reală, deliberată, nu un test fără efecte.
