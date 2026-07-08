# UPDATE 236 - Concedii si asociere Kiosk

Versiune: 2.12.216

## Modificari

- Pagina Concedii are buton si formular pentru cerere noua.
- Formularul permite selectarea angajatului, tipului si perioadei.
- Cererile afiseaza numele angajatului, perioada, numarul de zile si starea.
- Fisa angajatului are selectorul `Cont aplicatie / Kiosk`.
- Asocierea este salvata in `hr.employees.user_id` pentru JSON si MSSQL.
- Asocierea aceluiasi cont la doi angajati este blocata.
- Cererile Kiosk verifica suprapunerile la fel ca formularul HR.

## Testare

- Editeaza angajatul si asociaza contul aplicatiei.
- Reautentifica utilizatorul si deschide Kiosk.
- Creeaza o cerere din Kiosk si aprob-o din HR - Concedii.
- Verifica aparitia zilelor in Pontaj.
