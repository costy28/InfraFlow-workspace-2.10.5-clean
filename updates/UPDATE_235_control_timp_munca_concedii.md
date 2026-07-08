# UPDATE 235 - Control timp de munca si concedii

Versiune: 2.12.215

## Modificari

- Orele suplimentare primesc status `propus`, `aprobat` sau `respins`.
- Respingerea cere motiv, iar orice decizie este auditata.
- Banca de ore include numai orele aprobate si istoricul anterior fara status.
- Pontaj Avansat afiseaza propunerile si exceptiile saptamanale.
- Controlul operational semnaleaza peste 48 ore/saptamana si peste 12 ore/zi.
- Cererile de concediu suprapuse sunt refuzate.
- Concediile aprobate completeaza pontajul pe zilele lucratoare.
- Lunile inchise si pontajele validate sunt protejate.
- Reparat raspunsul la crearea cererilor de concediu.

## Baza de date

- `057_hr_overtime_approval.sql`

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
