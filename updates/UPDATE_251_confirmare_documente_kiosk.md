# UPDATE 251 — Confirmare documente HR în Kiosk

Versiune: 2.12.231  
Data: 2026-07-09

## Schimbări

- Documentele HR generate electronic sunt publicate automat în Kiosk pentru consultare.
- HR poate marca manual un document din dosarul electronic ca **Necesită confirmare Kiosk**.
- Kiosk afișează cardul **Documentele mele HR**, cu documente neconfirmate și confirmate.
- Angajatul poate deschide documentul și apăsa **Am luat la cunoștință**.
- Confirmarea salvează:
  - data/ora confirmării;
  - utilizatorul/angajatul;
  - numele afișat;
  - IP-ul;
  - notă de confirmare.
- Confirmarea este înregistrată în audit.

## Bază de date

- Migrare nouă: `db/migrations/063_hr_employee_file_acknowledgements.sql`
- Coloane noi pe `hr.employee_files`:
  - `generated`
  - `generated_source`
  - `requires_ack`
  - `kiosk_visible`
  - `acknowledged_at`
  - `acknowledged_by`
  - `acknowledged_by_name`
  - `acknowledged_note`
  - `acknowledged_ip`

## Compatibilitate

- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.
- Confirmarea cere conexiune online pentru audit corect.
