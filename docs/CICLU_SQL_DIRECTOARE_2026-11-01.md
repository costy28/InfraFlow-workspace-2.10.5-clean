# Ciclu worker separat — implementare locală, neinstalată

worker-directory-control-sql.js folosește profilul exact cinci RPC, dar
transportul permite numai claim/release și intenția tenant_directories.
Refuză renew, intenția OS și orice alt RPC înainte de operația SQL.

directory-cycle-sql-broker.js leagă inițializarea de job/trial, OS intent
anterior, încercare și UID/GID. După claim, generația/revizia vin din receiptul
lease validat. Intenția trebuie să corespundă bindingului și tokenului lease.
Prepare este permis doar după intenție; release doar după receipt prepared
confirmat. Nicio reluare, adopție sau compensare la rezultat incert.

API exclusiv de bibliotecă: init/check/claim/intent/prepare/release/shutdown.
Nu are CLI, credențiale sau lansare implicită. Nu modifică brokerii/checker-ele
vechi. Nu are executor OS, creare baze de date sau activare trial.

Șapte teste locale: parser strict și getteri, parametrizare, refuz RPC și
scope vechi, shutdown, ciclu complet simulat, răspuns prepare pierdut fără
release și lease străin. Receipt datetime2 folosește formatul SQL UTC fără
sufix timezone, conform clientului lease existent.

Rămâne conectarea întregului ciclu la jurnalul durabil înainte de fiecare
cerere, lansatorul systemd și inspecția de review. Nu este autorizată/probată
operația reală pe VPS prin simpla trecere a testelor simulate.
