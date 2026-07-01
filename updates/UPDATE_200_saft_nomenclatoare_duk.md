# UPDATE 200 - Nomenclatoare SAF-T si integrare DUK

Versiune: 2.12.180  
Data: 30.06.2026

## Implementare

- Facturile SAF-T folosesc nomenclatorul ANAF: 380, 381, 384, 389, 575 si 751.
- TVA foloseste coduri distincte pentru vanzari, achizitii si note contabile.
- Cotele uzuale 21%, 19%, 11%, 9% si 5% sunt mapate la codurile oficiale publicate de ANAF.
- Operatiunile fara relevanta fiscala folosesc TaxType 000 si TaxCode 000000.
- Miscarile de stoc folosesc codurile oficiale 10-120, nu etichete interne InfraFlow.
- Detectorul validatorului accepta `SAGA_FREETAB_PATH` si `ANAF_DUK_PATH`.
- DUK D406 primeste automat `an` si `luna` din SelectionStartDate.

## Verificare

- Regresiile contabile includ verificari pentru InvoiceType 380, TaxCode 310344 si MovementType 70.
- Candidatul complet D406 continua sa treaca schema XSD ANAF cu zero erori.
- Validarea DUK ramane explicit indisponibila daca Java nu este instalat.

## Livrare

- Build complet Server EXE.
- Build complet Client EXE.
- Pachet update ZIP fara date demo sau date runtime.
