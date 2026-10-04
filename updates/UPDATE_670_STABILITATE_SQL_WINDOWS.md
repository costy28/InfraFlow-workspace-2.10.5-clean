# UPDATE 670 — Stabilitate SQL Server la pornirea Windows (v2.12.650)

## Problemă rezolvată

În anumite instalări Windows, taskul `InfraFlow ERP` rulează sub contul `SYSTEM`
cu o variabilă `PSModulePath` incompletă. Executorul SQL Server bazat pe Windows
PowerShell nu mai putea încărca `Microsoft.PowerShell.Utility` și orice scriere
programată putea opri procesul Node.

## Corecție

- executorul SQL transmite explicit directorul standard al modulelor Windows
  PowerShell și importă controlat modulul necesar;
- `start-server.bat` generat de installer și de scriptul de reconfigurare
  setează aceeași cale înainte de pornirea serverului;
- nu se modifică date, schema SQL, credențiale sau fluxuri comerciale.

## Verificare după actualizare

1. rulează `Invoke-RestMethod http://127.0.0.1:4180/api/health`;
2. păstrează aplicația deschisă cel puțin un ciclu al taskurilor programate;
3. verifică faptul că nu mai apare eroarea `Add-Type` în `logs/infraflow.err.log`.
