# UPDATE 180 - Salarizare, D112 si inchidere fiscala

Versiune: 2.12.159 -> 2.12.160

## Salarizare faza 2

- Ajustari salariale pe angajat: spor, beneficiu impozabil, indemnizatie medicala si retinere.
- Ajustarile pot fi lunare sau recurente si se aplica la regenerarea statului.
- Concediul medical blocheaza validarea daca indemnizatia aprobata lipseste.
- Fluturas HTML pentru fiecare angajat din stat.
- Export Excel pentru platile bancare, cu verificarea IBAN-urilor.
- Nota contabila automata pentru salarii si contributii, fara dublare.

## D112

- Sursa XML se genereaza exclusiv dintr-un stat salarial validat.
- Fisierul include amprenta SHA-256 si toate totalurile statului.
- Rezultatul este marcat explicit drept sursa tehnica InfraFlow.
- Acceptarea ANAF ramane conditionata de validatorul oficial si recipisa inregistrata.
- Diagnostic pentru calea locala configurata prin `D112_VALIDATOR_PATH`.

## Inchidere fiscala

- Checklistul fiscal este inclus in verificarea inchiderii lunii.
- Mesajul de blocare indica prima problema si pagina unde se rezolva.
- Marcarea perioadei ca depusa cere recipise acceptate pentru D300, D394 si D112.

## Baza de date

- Migrare noua: `db/migrations/037_hr_payroll_phase2.sql`.
- Tabele noi: `hr.payroll_adjustments`, `hr.payroll_payments`.
- Legatura dintre statul salarial si nota contabila este pastrata in `hr.payroll_runs`.
