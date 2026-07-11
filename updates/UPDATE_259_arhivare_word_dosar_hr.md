# UPDATE 259 — Arhivare Word generat în dosar HR

Versiune: 2.12.239  
Data: 2026-07-11

## Schimbări

- A fost adăugat endpoint-ul `POST /api/hr/document-templates/:id/render-word/archive`.
- Endpoint-ul generează documentul Word din șablonul `.docx` și îl arhivează direct în dosarul electronic al angajatului.
- Documentele sunt salvate în `storage/hr-files/employee_<id>`.
- Înregistrarea este adăugată în `hr.employeeFiles`, cu:
  - `generated: true`;
  - `mime_type` Word `.docx`;
  - `generated_source`;
  - `requires_ack`;
  - `kiosk_visible`.
- Panoul de contracte salarizare are acțiune `Arhivează Word` pentru CIM.
- Istoricul actelor adiționale are acțiune `Arhivează` pentru documentul Word generat.
- Documentele arhivate devin vizibile în dosarul HR și în Kiosk pentru confirmare.
- Download-ul Word și arhivarea folosesc același motor de randare, ca să nu apară diferențe între documentul verificat și documentul arhivat.

## Compatibilitate

- Compatibil DB_MODE=json.
- Compatibil MSSQL.
- Nu introduce dependențe noi.
