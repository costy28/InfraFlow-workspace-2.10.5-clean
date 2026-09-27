# CRM / Sales Automation — Sprint 2

## Scop livrat

Sprintul introduce nucleul comercial înainte de ofertare: Lead-uri, prospecte, contacte, activități și follow-up-uri. CRM este disponibil numai când modulul este activ și schema MSSQL relațională este pregătită.

## Date și flux

`Lead → calificare → prospect/contact → follow-up task`

- Lead-ul păstrează sursa, responsabilul, valoarea estimată, starea și motivul pierderii.
- Conversia creează prospectul și, opțional, contactul sau leagă un prospect/contact CRM existent.
- Conversia nu creează un terț contabil. Legătura contabilă rămâne explicită și ulterioară.
- Follow-up-ul este un task din modulul existent, cu sursa `crm_lead`; nu există tabel paralel de task-uri CRM.

## Limite intenționate

Nu sunt livrate încă Oferte, Comenzi, Facturare, Oblio sau SmartBill. Sprintul următor poate construi Oferte versionate peste aceste identități comerciale validate.

## Operațiuni și siguranță

- Orice scriere este validată server-side, cere permisiunea CRM adecvată și intră în audit.
- Lead-urile sunt anulate logic, nu șterse fizic.
- În `DB_MODE=json`, API-ul răspunde controlat cu indisponibilitatea schemei CRM; aplicația nu creează o copie paralelă a datelor comerciale.
