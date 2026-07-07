# Contabilitate - manual scurt

## Lucru zilnic

- Introdu facturile in draft si verifica tertul, data, conturile, TVA si centrul de cost.
- Valideaza documentul numai cand nota contabila afisata este corecta.
- Foloseste devalidarea sau storno; nu sterge documente validate.
- Inregistreaza banca si casa, apoi reconciliaza operatiunile cu facturile.

## Inchidere lunara

- Rezolva documentele draft, soldurile necorelate si diferentele TVA.
- Verifica balanta, registrul jurnal, jurnalele de cumparari/vanzari si fisele de cont.
- Genereaza dosarul fiscal, valideaza declaratiile si inregistreaza recipisele.
- Creeaza backup, apoi inchide luna.

## D205 si Intrastat

- D205: completeaza registrul anual, ruleaza Validare si exporta XML doar daca schema este acceptata.
- Intrastat: completeaza fluxul, tara partenera, codul NC, natura tranzactiei, masa si valorile. Exportul XML este marcat fisier de lucru pentru aplicatia INS.

## e-Factura si SPV

- Fara OAuth configurat: descarca XML-ul validat, incarca-l manual in SPV si ataseaza raspunsul.
- Cu OAuth configurat: autorizarea se face din contul ANAF al clientului. Secretul si tokenurile sunt criptate local.
- O factura nu devine acceptata fara raspuns/recipisa ANAF.
