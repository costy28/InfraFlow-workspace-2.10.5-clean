# UPDATE 024 — Pornire robustă + MSSQL server + regresii pilot
Data: 02 Iunie 2026
Versiune: 2.12.4

## Descriere
Hotfix operațional pentru instalarea pilot după restart Windows.

## Corecții
- Taskul `InfraFlow ERP` păstrează un launcher activ și repornește serverul la 15 secunde dacă SQL Express nu este încă pregătit sau Node se oprește.
- Loginul SQL `infraflow` primește rolul `sysadmin`, necesar pentru migrări și integrarea bazei `autoMinder5`.
- Conexiunea Autominder implicită folosește instanța locală `.\SQLEXPRESS`, fără parolă hardcodată.
- Pagina Mecanizare afișează buton direct `Foi Parcurs`.
- Instalările noi pornesc cu limita trial de 50 utilizatori și 50 dispozitive.
- Bazele create anterior cu trial `initial-setup` și limita veche de 5 utilizatori sunt actualizate automat la 50.

## Intervenție server existent
Rulați din nou `scripts/windows/CREARE_BAZA_INFRAFLOW.sql` în SSMS, apoi instalați `InfraFlow-Server-Setup-v2.12.4.exe` peste versiunea existentă.
