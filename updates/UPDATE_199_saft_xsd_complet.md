# UPDATE 199 - Generator SAF-T conform structural XSD

Versiune: 2.12.179  
Data: 30.06.2026

## Implementare

- Generatorul SAF-T a fost separat in sursa de date si renderer XML modular.
- Header-ul D406 respecta ordinea si campurile obligatorii din schema ANAF.
- MasterFiles include conturi, clienti, furnizori, produse, unitati de masura si tipuri de miscari.
- Conturile includ soldurile de deschidere/inchidere si tipul Activ/Pasiv/Bifunctional.
- GeneralLedgerEntries include jurnale, tranzactii, linii, sume si informatii fiscale.
- SourceDocuments include facturi de vanzare, facturi de cumparare, plati/incasari si miscari de stoc.
- Produsele sunt verificate pentru codul NC/commodity necesar SAF-T.
- Datele companiei sunt verificate pentru CUI, denumire, adresa, localitate, telefon si IBAN.
- Validatorul DUK nu este apelat daca lipsesc date sursa reale, chiar daca XML-ul este valid structural.

## Verificare

- Fixture complet: Header + 582 conturi + terti + produse + jurnal + facturi + plati + stoc.
- Rezultat schema `Ro_SAFT_Schema_v249_2025.xsd`: `0 erori XSD`.
- Exportul fiscal ramane blocat pana la acceptarea validatorului DUK ANAF.

Acest update nu modifica datele contabile existente si nu adauga migrari MSSQL.
