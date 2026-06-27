# UPDATE 171 - Facturi din NIR-uri si retururi furnizor

Versiune: 2.12.151

## Functionalitati

- O factura furnizor poate fi creata din mai multe NIR-uri ale aceluiasi furnizor.
- Totalul declarat al facturii este comparat cu totalul receptiilor, iar diferentele raman vizibile in reconcilierea contabila.
- Achizitii include tabul `Receptii`, cu statusul legaturii contabile si istoricul returului.
- Returul poate fi partial sau integral pe fiecare material receptionat.
- Returul scade stocul, recalculeaza costul mediu, redeschide cantitatea din comanda si creeaza miscari de stoc trasabile.
- Returul integral poate anula factura draft sau storna factura validata si nota contabila aferenta.
- Returul partial cere explicit inregistrarea notei de credit primite de la furnizor.
- O factura achitata nu poate fi stornata automat pana cand plata nu este corectata in Trezorerie.

## Compatibilitate si verificare

- Datele noi sunt pastrate in `app_state`, compatibil atat cu `DB_MODE=json`, cat si cu `DB_MODE=mssql`.
- Nu este necesara o migrare SQL noua pentru acest lot.
- Teste contabile: 24/24 trecute.
- Build frontend reusit.
- Interfata verificata la desktop si la 390 px fara overflow orizontal.
