# UPDATE 172 - Note de credit si circuit furnizor complet

Versiune: `2.12.152`  
Data: 27.06.2026

## Functionalitati

- Retururile partiale de marfa pot genera note de credit furnizor in stare draft.
- Notele de credit suporta editare draft, validare, devalidare, storno si anulare logica.
- Validarea genereaza nota contabila inversa, reduce soldul facturii si inchide returul contabil.
- Devalidarea si storno refac soldul facturii si redeschid returul pentru corectie.
- Valoarea notei este limitata la soldul disponibil al facturii dupa plati si alte note de credit.
- TVA/D300 si D394 includ corectiile validate cu valori negative.
- Facturile acoperite integral prin note de credit au statusul `creditata` si filtru dedicat.

## Facturi din NIR-uri

- Formular dedicat pentru una sau mai multe receptii ale aceluiasi furnizor.
- Diferenta fata de totalul NIR-urilor poate fi distribuita proportional pe linii.
- Distribuirea pastreaza cotele TVA si corecteaza ultima linie pentru egalitate exacta.
- Selectia afiseaza receptiile, datele, totalul si furnizorul inainte de creare.

## Fisa furnizor

- Istoric separat pentru note de credit si actiunile permise de status.
- Circuit complet: comanda, NIR, factura, plata si retur.
- Fiecare circuit indica explicit pasul lipsa sau faptul ca este complet.
- Exportul Excel include sumar, note de credit si circuitul de achizitie.
- Fisa poate fi tiparita sau salvata PDF din browser.

## Compatibilitate si verificari

- Colectia `creditNotes` este pastrata prin stratul central `readDb` / `writeDb`.
- Compatibil cu `DB_MODE=json` si cu modul MSSQL bazat pe `dbo.app_state`.
- Nu este necesara o migrare SQL relationala pentru acest update.
- Teste contabile automate: 28/28.
- Build frontend verificat.
- Interfata verificata desktop si la 390 px, fara overflow orizontal.
