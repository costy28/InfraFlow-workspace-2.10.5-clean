# UPDATE 301 — Split dosar angajat HR

Versiune: `2.12.281`
Data: `2026-07-13`

## Ce s-a schimbat

- Tabul `Dosar` din fișa angajatului a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HREmployeeFilesTab.jsx`.
- Componenta nouă randează:
  - lista documentelor din dosarul electronic;
  - upload-ul de documente reale: PDF, imagini, DOCX, XLSX;
  - sugestia ghidată venită din Inbox HR;
  - previzualizarea/deschiderea documentelor generate electronic;
  - descărcarea documentelor;
  - editarea metadatelor, confirmarea Kiosk și anularea documentelor.
- `HRPage.jsx` păstrează selecția angajatului, permisiunile și handler-ul de curățare a sugestiei din Inbox HR.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este strict de mentenanță frontend.

## Verificări

- `npm --prefix client run build` — OK.
