# UPDATE 019b — Scule/Unelte + Catalog gestionar

Data: 01 Iunie 2026
Versiune: 2.11.10

## Descriere

Extindere modul echipamente cu scule/unelte urmărite individual prin număr de
serie și valoare de inventar, catalog editabil de gestionar pentru adăugarea
obiectelor noi și inventar complet pe angajat cu totalul valorii aflate în
răspundere.

## Funcționalități

- Categorii noi: `scule`, `unelte`, `inventar`, `SSM` și `altele`.
- Catalog gestionar cu creare și editare obiecte.
- Reguli condiționale pentru mărime, număr de serie și expirare.
- Valoare inventar obligatorie pentru scule, unelte și inventar.
- Fișa angajatului separă echipamentele, sculele și celelalte obiecte.
- Predare individuală la lichidare și notă de lichidare cu liste distincte.
- Card Kiosk cu totalurile valorice aflate în răspundere.

## Fișiere principale

- `db/migrations/019b_scule_catalog.sql`
- `server/modules/hr/echipamente-routes.js`
- `server/modules/hr/routes.js`
- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/KioskPage.jsx`
