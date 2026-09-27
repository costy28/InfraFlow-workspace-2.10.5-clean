# InfraFlow v2.12.571 - Hotfix performanță Oferte CRM

## Ce rezolvă

- Pagina **CRM / Vânzări → Oferte** preia lista, prospectele/clienții, contactele și fișa selectată într-un singur spațiu de lucru CRM.
- Fișa unei oferte citește oferta, pozițiile și reviziile într-o singură operație SQL, în loc de citiri succesive.
- Executorul MSSQL concatenează toate fragmentele unui răspuns `FOR JSON`; SQL Server poate împărți JSON-ul mare pe mai multe rânduri.

## Efect

- Reduce blocarea interfeței în special la deschiderea unei oferte cu poziții și revizii.
- Nu modifică datele comerciale, statutul unei oferte, permisiunile sau fluxul de aprobare.

## Verificări

- Teste CRM fundație, Sprint 2, Sprint 3 și Sprint 4.
- Citire directă controlată pe MSSQL: fișă ofertă și spațiu de lucru Oferte.
- Build frontend, audit expunere fișiere și validare pachet release.
