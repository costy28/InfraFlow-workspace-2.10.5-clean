# UPDATE 198 - Schema oficiala SAF-T si validare XSD

Versiune: 2.12.178  
Data: 30.06.2026

## Modificari

- Schema oficiala ANAF `Ro_SAFT_Schema_v249_2025.xsd` este livrata cu aplicatia.
- Fisierul este verificat la runtime prin SHA-256 inainte de utilizare.
- Profilul D406 selecteaza automat namespace-ul oficial si versiunea XSD `2.4.9` pentru perioadele incepand cu 2025.
- Versiunea structurii `AuditFile` ramane distincta (`2.00`) fata de versiunea tehnica a XSD-ului.
- Orice candidat D406 este verificat structural cu XSD-ul inainte de apelarea validatorului DUK configurat.
- Erorile structurale sunt pastrate in rularea SAF-T si afisate in Audit fiscal.
- Descarcarea fiscala ramane blocata pana cand fisierul trece XSD si validatorul ANAF configurat.
- Backend-ul accepta acum salvarea configuratiei validatorului D406.

## Sursa oficiala

- ANAF: `https://static.anaf.ro/static/10/Anaf/Informatii_R/Ro_SAFT_Schema_v249_2025.xsd`
- SHA-256: `80AD7EAAF2AAFD656A6E3C0E69E3A8FCDB23262640287EBBA6383FF3014DCCC2`
- Namespace: `mfp:anaf:dgti:d406t:declaratie:v1`

## Observatie de control

XSD-ul contine atributul tehnic `version="2.4.9"`, dar documentatia sa interna mentioneaza inca `2.4.8`. InfraFlow pastreaza ambele valori in profil si foloseste versiunea tehnica a schemei pentru identificare.

Acest update nu modifica si nu migreaza date contabile existente.
