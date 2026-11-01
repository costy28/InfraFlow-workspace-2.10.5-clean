# Worker directoare — tranziție SQL patru către cinci RPC

Ordine: SHA, preflight numai metadate, backup COPY_ONLY/CHECKSUM/VERIFYONLY,
confirmare separată, grant, verificare numai metadate. Nicio parolă salvată
de pachet, nicio preluare de job, creare directoare sau repornire de servicii.

Identitate existentă fixă: infraflow_demo_lease. Înainte: exact EXECUTE pe
provision_lease_command, record_step_intent, adapter_review_ticket_command,
prepare_os_identity_delegation; după: aceleași plus prepare_tenant_directories.
Fără drepturi directe sau administrative și fără acces la ERP.

Tranzacția de grant revalidează schema 021, mappingul login/user, lipsa
rolurilor/proprietăților, job queued/revizie7/generație3 fără lease și fără
activare, tabele directoare goale. Revalidează drepturile efective după
unicul GRANT. Eșecul SQL face rollback; la rezultat pierdut nu relua și nu
revoca automat: verifică starea separat.

IMPORTANT: checker-ele și brokerii vechi cu profil exact patru RPC vor refuza
intenționat noul profil. Nu le rula după grant și nu le relaxa implicit.
Workerul permanent este absent conform inventarului VPS. Transportul cu
profil cinci RPC va fi pregătit separat înainte de orice operație reală.

Probe locale: două teste structurale pentru grant unic, baseline distinct,
metadate și rollback. Acestea nu înlocuiesc verificarea efectivă pe VPS.
VERIFYONLY confirmă setul de backup, nu o restaurare de probă.
