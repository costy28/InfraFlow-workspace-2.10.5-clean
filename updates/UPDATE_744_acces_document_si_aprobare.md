# UPDATE 744 — Acces pe document și aprobare

Versiune: **2.12.724**

Citirea dosarului în MSSQL, PDF-ul, istoricul și partajarea verifică accesul pe entitate. Contextul relațional folosește pașii și partajările documentului, nu un snapshot JSON. Partajările expirate sunt excluse din această verificare. Retragerea cere `documents:create`; motorul păstrează condiția de inițiator.

Interfața cere `documents:approve` pentru Inbox și decizie. Atribuirea unui pas nu înlocuiește permisiunea; un pas viitor nu devine acțiune curentă. Lansarea verifică draftul propriu și dreptul de creare.

Verificări: 12 scenarii HTTP reale în JSON temporar; 27 teste pentru permisiuni și evaluatorul de acces, inclusiv context relațional simulat; Chrome cu API simulate. Nu s-a executat o integrare SQL live pentru aceste rute. Nu schimbă schema bazei.

Rămân auditul altor rute (inclusiv urmărire/lista partajate), acțiunile Task/Email și normalizarea legacy a drepturilor rolurilor standard în db.js. Nu declară auditul întregului modul încheiat.
