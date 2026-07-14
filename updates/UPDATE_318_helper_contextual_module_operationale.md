# UPDATE 318 — Helper contextual module operaționale

Versiune: `2.12.298`  
Data: `2026-07-14`

## Scop

Extinderea ghidajului contextual către modulele operaționale mari, astfel încât utilizatorul să vadă rapid următorul pas logic fără să cunoască toate submeniurile.

## Modificări

- `Contabilitate`
  - helper comun în `AccountingShell`, vizibil pe subpaginile contabile;
  - traseu recomandat: nomenclatoare → documente sursă → rapoarte/control → închidere lună;
  - acțiune rapidă către pasul următor.
- `Achiziții`
  - helper dinamic pentru cerințe, comenzi deschise, recepții, cântar și PAAP;
  - recomandare rapidă către tabul relevant sau creare comandă.
- `Referate`
  - helper pentru primul referat, drafturi, referate în aprobare, aprobate și respinse;
  - acțiune rapidă către filtrul sau modalul relevant.
- `Mecanizare`
  - helper pentru cereri parc, planificări, bonuri de lucru, alimentări PIUSI și scadențe/service;
  - recomandare către zona care cere atenție.

## Compatibilitate

- Nu au fost schimbate endpointuri.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Update-ul este strict frontend/UI și păstrează comportamentul operațional existent.

## Verificare

- `npm --prefix client run build` — OK.
