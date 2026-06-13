# UPDATE 049 - Configurare module, MSSQL si departamente

Versiune: 2.12.27 -> 2.12.28
Data: 2026-06-12

## Schimbari

- Rotita din cardurile modulelor este functionala si deschide configurarea subfunctiilor modulului.
- Subfunctiile active se salveaza in `settings.module_features`, pregatit pentru licentiere granulara.
- Setari are tab nou `Baza date`, cu:
  - server SQL;
  - baza de date;
  - autentificare Windows Integrated sau SQL user/parola;
  - test conexiune;
  - salvare in `runtime/mssql.env`.
- La salvarea MSSQL se verifica si se pregateste tabela principala `dbo.app_state`.
- Departamentele pot primi permisiuni direct din modalul de creare/editare.
- Modulul Mesaje face fallback la `app_state` daca schema MSSQL relationala nu raspunde.

## Motiv

Submodulele si optiunile trebuie configurate in interiorul modulului, nu imprastiate in navigatia principala. Configurarea SQL trebuie sa fie disponibila din UI, pentru cazurile in care userul/parola bazei se schimba sau instalarea foloseste autentificare SQL.

## Verificari

- `node --check` pentru rutele modificate.
- `npm run build` pentru client.
- `server/app` se incarca in `DB_MODE=json`.
