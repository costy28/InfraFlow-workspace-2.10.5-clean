# UPDATE 110 - Layout sidebar colapsabil

Versiune: 2.12.90
Data: 2026-06-22

## Modificari

- Sidebar-ul poate fi restrans pe desktop din butonul din bara superioara sau din header-ul meniului lateral.
- In modul restrans raman vizibile iconitele, iar denumirile modulelor apar ca tooltip prin titlul linkului.
- Preferinta `infraflow_sidebar_collapsed` se salveaza in browser, astfel incat layout-ul ales ramane dupa refresh.
- Latimea normala a sidebar-ului pe desktop a fost redusa pentru a lasa mai mult spatiu modulelor cu tabele late, in special Contabilitate.
- Comportamentul pe mobil ramane neschimbat: meniul lateral se deschide ca drawer din butonul hamburger.

## Verificare

- `npm run build` in `client` a trecut cu succes.
