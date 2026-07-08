# UPDATE 241 - Registru CM si integrare salarizare

Versiune: 2.12.221

## Registru lunar

- Centralizare certificate verificate pe luna si angajat.
- Corelare certificat initial / in continuare in acelasi episod.
- Calcul zile calendaristice, lucratoare, neindemnizate, angajator si FNUASS.
- Procente configurabile; implicit codul 01 foloseste 55% / 65% / 75%.
- Regula temporara 01.02.2026-01.02.2027 este aplicata explicit.

## Salarizare

- Operatorul introduce baza zilnica rezultata din media ultimelor sase luni.
- Aplicatia calculeaza propunerea de indemnizatie si impartirea pe suportatori.
- Certificatul verificat este trimis o singura data ca ajustare salariala confirmata.
- Statul salarial existent preia automat indemnizatia si sumele angajator/FNUASS.

## Export si audit

- Export `Registru_CM_YYYY-MM.xlsx`.
- Audit la trimiterea in salarizare.
- Migrare `059_hr_medical_leave_payroll.sql`.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
