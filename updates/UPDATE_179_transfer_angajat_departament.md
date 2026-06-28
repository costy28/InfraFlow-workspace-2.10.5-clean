# UPDATE 179 - Transfer angajat intre departamente

Versiune: 2.12.158 -> 2.12.159

## Modificari

- Selector de departament disponibil in editarea angajatului.
- La schimbare se solicita data si motivul transferului.
- Transferul foloseste endpointul auditat existent si nu suprascrie anonim departamentul.
- Istoricul departamentelor este afisat in fisa angajatului.
- Ruta MSSQL actualizeaza sincron `department_id` si `department_cod`.
- Ruta de istoric returneaza transferurile si denumirile departamentelor si in MSSQL.

## Impact

- Pontajul, filtrele HR, documentele, echipamentele si salarizarea vad departamentul curent corect.
- Istoricul organizational ramane disponibil pentru audit si documente ulterioare.

## Verificari

- Sintaxa backend verificata.
- 50 teste de regresie trecute.
- Build frontend Vite finalizat.
