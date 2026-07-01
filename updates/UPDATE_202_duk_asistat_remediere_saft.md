# UPDATE 202 - DUK asistat si remediere SAF-T

Versiune: 2.12.182  
Data: 2026-07-01

## Modificari

- Audit fiscal afiseaza starea validatorului D406 si permite configurarea automata dintr-un singur buton.
- Detectorul prefera componenta CLI `DUKIntegrator.jar`, evitand lansarea interfetei grafice blocate.
- Java inclus in kitul DUK este detectat automat.
- Configurarea automata este testata si auditata inainte de salvare.
- Problemele SAF-T sunt structurate pe zone si includ actiunea recomandata si pagina de remediere.
- Erorile pentru terti deschid direct formularul clientului sau furnizorului indicat.
- Erorile DUK trimit spre TVA, plan de conturi, trezorerie, facturi, produse sau registrul jurnal.
- Logica de ghidare SAF-T este izolata intr-un fisier dedicat.

## Verificari

- 74 teste contabile automate trecute.
- Build frontend Vite finalizat.
- Endpointurile existente isi pastreaza raspunsurile si permisiunile.
