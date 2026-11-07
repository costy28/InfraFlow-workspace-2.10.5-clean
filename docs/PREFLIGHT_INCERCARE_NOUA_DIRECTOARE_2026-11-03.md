# Bază pentru o încercare nouă de directoare

SQL doar de citire, destinat bazei INFRAFLOW_DEMO_PLATFORM. Verifică jobul queued/revizia 9/generația 4 fără lease, trialul neactivat, exact încercarea pilot anterioară expirată, lipsa rezultatelor/observațiilor și dovada identității OS. Nu selectează secrete.

Marker: DIRECTORY_NEW_ATTEMPT_BASELINE_OK. Acesta nu autorizează mkdir, nu creează lease și nu validează starea filesystem-ului. O verificare OS separată, backup și confirmare sunt necesare înainte de efecte reale.

Fișierul este nou; preflight-urile vechi pentru queued/revizia 7/generația 3 nu trebuie reutilizate. Orice abatere impune oprire și verificare, nu corectarea automată a SQL.

Validare locală: revizie statică față de schema și verificatorul ciclului anterior. Execuția pe SQL Server VPS rămâne de confirmat de operator.
