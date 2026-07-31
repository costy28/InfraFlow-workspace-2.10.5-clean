# UPDATE 443 — Asistent discret Achiziții

Versiune: 2.12.423  
Data: 2026-07-31

## Scop

Achizițiile au multe fire care se ating: cerințe interne, comenzi, recepții, cântar, contracte și PAAP. Utilizatorul trebuie să vadă rapid ce cere atenție înainte să caute prin taburi.

## Modificări

- `client/src/pages/modules/AchizitiiPage.jsx`
  - înlocuit helperul generic cu un asistent compact de modul;
  - calcul automat pentru următorul pas recomandat;
  - indicatori rapizi pentru cerințe, comenzi deschise, recepții, PAAP și cântar;
  - detalii pliabile cu pașii operaționali și regulile de reținut.

## Recomandări detectate

- cerințe urgente de aprovizionare;
- comenzi deschise sau fără contract urmărit;
- poziții PAAP peste 90% sau depășite;
- produse de cântar nemapate pe materiale;
- flux sănătos, când nu există intervenții evidente.

## Tehnic

- Nu introduce endpointuri noi.
- Nu modifică schema bazei de date.
- Refolosește datele deja încărcate în pagina Achiziții.

## Verificări

- `npm run build` ✅
