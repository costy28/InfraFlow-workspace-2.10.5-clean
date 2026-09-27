# CRM / Sales Automation — fundație Sprint 1

Modulul CRM este separat de contabilitate, stocuri și task-uri. În această etapă
există doar schema relațională, contractele de integrare și un diagnostic tehnic.

- CRM păstrează identitatea comercială a clientului/prospectului în `crm.accounts`.
- Legătura cu un terț contabil este opțională (`accounting_third_party_id`), fără
  cheie străină: registrul terților existent rămâne momentan sincronizat hibrid.
- Activitățile consemnează trecutul; task-urile existente reprezintă acțiuni viitoare.
- Toate entitățile CRM se vor anula logic, nu se vor șterge fizic.
- `DB_MODE=json` nu primește o copie CRM; endpointul de sănătate explică faptul
  că funcționalitatea operațională necesită MSSQL relațional.

Sprinturile următoare pot adăuga repository-ul MSSQL, Leads, Oferte, acceptarea
securizată, Comenzi și adaptoarele reale către modulele InfraFlow.
