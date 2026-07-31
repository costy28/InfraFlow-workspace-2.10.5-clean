# UPDATE 444 — Asistent discret Gestiune / Depozit

Versiune: 2.12.424  
Data: 2026-07-31

## Scop

Gestiunea trebuie să avertizeze operatorul înainte ca lipsurile de stoc sau nomenclatorul incomplet să devină probleme în Achiziții, Contracte sau Contabilitate.

## Modificări

- `client/src/pages/modules/GestiunePage.jsx`
  - adăugat asistent compact de depozit;
  - calcul automat pentru următorul pas recomandat;
  - indicatori rapizi pentru materiale epuizate, sub minim, în atenție, bonuri draft și materiale fără CPV;
  - detalii pliabile cu pașii de igienă operațională.

## Recomandări detectate

- materiale epuizate;
- materiale sub stocul minim;
- bonuri de consum în așteptare;
- materiale fără stoc minim;
- materiale fără CPV;
- materiale fără locație de depozit;
- lipsă furnizori;
- flux sănătos, când nu există intervenții evidente.

## Tehnic

- Nu introduce endpointuri noi.
- Nu modifică schema bazei de date.
- Refolosește materialele, dashboardul de gestiune și furnizorii deja încărcați.

## Verificări

- `npm run build` ✅
