# UPDATE 739 — Simulare HTTP HR pe roluri

Versiune: **2.12.719**  
Data: **17 octombrie 2026**

Adaugă `npm run test:hr:roles`, o verificare prin HTTP real pentru cinci profiluri: angajat, șef departament, validator departamental, HR global și superadmin. Serverul ascultă pe loopback, cu bază JSON temporară și scheduler dezactivat.

Șase scenarii verifică accesul pe departamente, separarea drepturilor, refuzul loturilor mixte, pontajul validat și luna închisă, compensările invalide și aprobarea repetată a concediului. Nu se conectează la Oblio sau instalațiile active.

Raportul `docs/AUDIT_HR_ROLURI_2026-10-17.md` păstrează matricea, comenzile și limitele verificării. Nu necesită migrare de date sau schemă.

Rezultate: 175 teste HR standard trecute, 18 regresii de permisiuni trecute, 6 scenarii HTTP trecute și testul separat de integrare pe SQL Server real trecut (aproximativ 333 secunde, bază sintetică izolată).
