# UPDATE 280 — Split header si filtre HR frontend

Versiune: `2.12.260`
Data: 2026-07-12

## Ce s-a schimbat

- Header-ul paginii HR a fost extras din `client/src/pages/modules/HRPage.jsx` în `client/src/pages/modules/hr/HRPageChrome.jsx`.
- Filtrele generale HR au fost extrase în componenta `HRFilters`, în același fișier.
- `HRPage.jsx` păstrează state-ul și logica, iar componentele noi primesc doar props pentru randare și actualizare filtre.

## Comportament păstrat

- Aceleași butoane principale: import CSV/Excel și angajat nou.
- Aceleași filtre pentru departament, angajați activi/inactivi, luna pontajului și autorizații.
- Aceleași schimbări de state prin `setFilters`, `setImportModal` și `setEmployeeModal`.
- Nicio schimbare de API sau flux funcțional.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`

## Observație tehnică

Acesta este al doilea pas din split-ul frontend HR. Am mutat doar rama paginii și filtrele, lăsând fluxurile sensibile de pontaj, concedii, documente și echipamente în `HRPage.jsx`.
