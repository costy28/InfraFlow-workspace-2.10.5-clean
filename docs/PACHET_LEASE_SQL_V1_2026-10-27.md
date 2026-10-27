# Pachet privat lease SQL v1 — pregătire, nu activare

Acest pachet conține numai migrările 006/007, scriptul de creare a loginului,
scriptul de drepturi și documentația. Nu conține parole, node_modules, credențiale,
unități systemd sau worker. Nu este un update ERP și nu se încarcă în updater.

## Ordinea instalării ulterioare (comenzi furnizate separat după verificări)

1. Transfer și verificare SHA-256 a arhivei; nu executa automat fișierele.
2. Confirmă serviciile existente sănătoase și versiunea schemei platformei.
3. Fă un backup nou al INFRAFLOW_DEMO_PLATFORM și verifică backupul.
4. Aplică 006 și verifică schema, apoi 007 și verifică schema. Niciuna nu acordă
   drepturi sau creează joburi/instanțe. Nu pornesc perioada de 15 zile.
5. Verifică absența loginului și userului infraflow_demo_lease. Dacă există oricare,
   oprește-te pentru inspecție; nu îl șterge/recrea și nu modifica parola.
6. Numai după confirmare, rulează scriptul Python cu --create-confirmed într-un
   terminal SSH interactiv. Cere SA și parola NOUĂ SQL lease, distinctă, de două ori.
7. Păstrează parola în managerul de parole. Nu o trimite în chat/capturi.
8. Confirmă LEASE_LOGIN_VERIFIED. Nu există restart și nu se instalează credențiala.

## La eroare

- `lease_identity_exists_stop`: nu relua; inspectează loginul și mappingul.
- `lease_migration_required`: verifică 006/007 pe baza platformei, nu pe ERP.
- `sql_step_not_confirmed`: rezultatul poate fi incert după commit; verifică
  existența și drepturile fără a recrea contul.
- `password_format_invalid`: formatul/confirmarea nu sunt valide; nu publica parola.
- Orice eroare: păstrează diagnosticul generic și etapa, nu stdout/stderr brut.

Proba locală nu validează Linux/sqlcmd/systemd pe VPS. Instalarea credențialei
și proba systemd vor avea un pachet separat. Publicarea oficială rămâne blocată.
