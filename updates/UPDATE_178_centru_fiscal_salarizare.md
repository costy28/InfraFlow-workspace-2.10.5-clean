# UPDATE 178 - Centru fiscal, salarizare si e-Factura

Versiune: 2.12.157 -> 2.12.158

## Centru fiscal

- Checklist lunar unic pentru D300, D394, D112, SAF-T, e-Factura si trezorerie.
- Calendar fiscal orientativ, cu termen configurabil si avertisment de verificare in calendarul oficial ANAF.
- Navigare separata intre control, declaratii si registru, fara mutarea modulelor in sidebar.

## Salarizare faza 1

- Profil fiscal versionat dupa data intrarii in vigoare.
- Calcul brut, sporuri, CAS, CASS, impozit, retineri, net, CAM si cost angajator.
- Corectii per angajat, validare, devalidare cu motiv si export Excel.
- Concediile medicale si exceptiile sunt marcate explicit pentru calcul si control separat.
- Migrare: `db/migrations/036_hr_payroll.sql`.

## D112

- Pontajul si contractele raman sursele HR obligatorii.
- Pregatirea D112 necesita acum stat salarial validat pentru toti angajatii activi.
- XML-ul fiscal final nu este simulat; ramane dependent de schema ANAF aplicabila.

## e-Factura

- Validare obligatorie a emitentului, clientului, liniilor si totalurilor.
- Comparatie cu factura contabila sursa si blocarea diferentelor dupa iesirea din draft.
- Tranzitii controlate intre draft, validata, trimisa SPV, acceptata si respinsa.
- Arhivare XML si raspuns SPV cu checksum SHA-256 si audit.

## Verificari

- 50 teste de regresie trecute.
- Build frontend Vite finalizat.
