# UPDATE 240 - Certificate concediu medical

Versiune: 2.12.220

## Kiosk angajat

- Formular extins pentru concediul medical.
- Date certificat: serie, numar, initial/continuare, data acordarii, perioada, cod indemnizatie, cod diagnostic, medic, parafa si unitate emitenta.
- Calcul automat al zilelor calendaristice.
- Document justificativ obligatoriu: PDF, JPG sau PNG, maximum 10 MB.

## Verificare HR

- Certificatul apare in pagina HR - Concedii fara expunerea diagnosticului in lista generala.
- HR poate deschide documentul, confirma verificarea sau respinge cu motiv.
- Cererea CM nu poate fi aprobata inaintea verificarii documentului.
- Vizualizarea documentului si toate schimbarile de stare sunt auditate.

## Baza de date

- Migrare `058_hr_medical_leave_certificates.sql`.
- Tabel nou `hr.medical_leave_certificates`.
- Compatibilitate completa `DB_MODE=json`.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
