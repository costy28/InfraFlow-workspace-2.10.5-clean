# Fluxuri funcționale end-to-end

## Cum se citesc fluxurile

Fiecare flux descrie rezultatul de business, nu doar paginile. **Confirmat în cod** înseamnă că elementele traseului există; **UAT obligatoriu** înseamnă că întregul traseu trebuie executat înainte de publicarea unui ghid ca procedură garantată.

## FL-01 — Instalare și prima configurare

- **Scop:** instalație pregătită pentru utilizare.
- **Actor principal:** Superadmin.
- **Pași:** pornire → wizard → profil organizație/țară/monedă → administrator → module/pachet → email și integrări necesare → utilizatori/roluri → verificare Dashboard.
- **Rezultat:** organizația este configurată și utilizatorii văd numai modulele efective.
- **Excepții:** SQL indisponibil, configurare incompletă, modul nelicențiat, SMTP extern indisponibil.
- **Dovadă:** setup, module catalog, Setări și onboarding identificate în cod.
- **Stare:** Confirmat în cod; UAT Windows și Linux obligatoriu.

## FL-02 — Lead → prospect și contact

- **Actor:** Vânzări.
- **Pași:** creare/import lead → activitate/follow-up → calificare → conversie → verificare prospect și contact.
- **Rezultat:** relațiile comerciale sunt păstrate și conversia nu se dublează.
- **Excepții:** email/identificator duplicat, lead deja convertit, drept CRM insuficient.
- **Legături:** Task-uri, notificări, audit.
- **Stare:** Confirmat în cod; UAT cu duplicate obligatoriu.

## FL-03 — Prospect/contact → ofertă → decizie client

- **Actor:** Vânzări, Manager comercial, Client extern.
- **Pași:** alegere client → creare ofertă draft → linii/monedă/TVA/discount → revizie → aprobare → generare link securizat → trimitere → acceptare/respingere client.
- **Rezultat:** decizia și revizia acceptată sunt auditate.
- **Excepții:** ofertă neaprobată, token expirat/revocat, SMTP indisponibil, revizie schimbată.
- **Stare:** Confirmat în cod; UAT public și email obligatoriu.

## FL-04 — Ofertă acceptată → comandă client

- **Actor:** Vânzări.
- **Pași:** deschidere ofertă acceptată → generare comandă → snapshot revizie/linii → verificare legătură în listă.
- **Rezultat:** o singură comandă confirmată, creată idempotent.
- **Excepții:** ofertă fără acceptare, comandă deja creată, date client incomplete.
- **Stare:** Confirmat în cod; UAT idempotent obligatoriu.

## FL-05 — Comandă client → disponibilitate stoc → necesar achiziții

- **Actor:** Vânzări, Gestionar, Achiziții.
- **Pași:** comandă confirmată → verificare informativă stoc → alegere manuală necesar → creare necesar/comandă precompletată → urmărire legături.
- **Rezultat:** lipsurile sunt predate Achizițiilor fără rezervare sau comandă automată ascunsă.
- **Excepții:** material fără mapare, cantitate indisponibilă, necesar deja creat.
- **Stare:** Confirmat în cod; UAT între roluri obligatoriu.

## FL-06 — Comandă client → proformă/factură draft → Oblio manual

- **Actor:** Vânzări, Contabil.
- **Pași:** legare client CRM la terț contabil → generare proformă/factură draft → verificare perioadă/TVA/monedă → deschidere în Contabilitate → confirmare explicită → emitere manuală Oblio, dacă este configurat.
- **Rezultat:** document intern trasabil; document extern numai după confirmare.
- **Excepții:** terț lipsă, serie/configurare/provider indisponibil, document deja emis.
- **Stare:** Flux intern confirmat în cod; Oblio live neconfirmat.

## FL-07 — Referat → aprobare → comandă → recepție/NIR

- **Actor:** Solicitant, aprobatori configurați, Achiziții, Gestionar.
- **Pași:** referat draft → poziții/CPV → lansare circuit configurat → aprobări/respingere → comandă furnizor → recepție → NIR/stoc → închidere comandă.
- **Rezultat:** trasabilitate de la necesar la recepție.
- **Excepții:** workflow invalid, aprobator lipsă, diferențe cantitative, comandă parțială.
- **Stare:** Componente confirmate în cod; UAT complet obligatoriu.

## FL-08 — Document → workflow → decizie → arhivare

- **Actor:** Creator, aprobatori, arhivar/secretariat.
- **Pași:** creare dosar → selectare tip → șablon și reguli → simulator/diagnostic → lansare cu snapshot → pași executați/săriți → aprobare/respinge/semnare → arhivare/urmărire.
- **Rezultat:** dosar cu audit complet al deciziilor.
- **Excepții:** reguli invalide, responsabil absent, document modificat concurent, fișier neautorizat.
- **Stare:** Confirmat în cod; UAT pe ramuri de reguli obligatoriu.

## FL-09 — Contract CRM → activare → urmărire → închidere

- **Actor:** Manager contract/comercial.
- **Pași:** comandă CRM confirmată → contract draft → completare date/document semnat → activare → legare comenzi/recepții/documente → consum/alerte/task-uri → raport → închidere.
- **Rezultat:** dosar contractual complet și consum justificat prin surse.
- **Excepții:** document semnat lipsă, depășire, scadențe, sursă duplicată, obligații deschise.
- **Stare:** Confirmat în cod; UAT cu valori și alerte obligatoriu.

## FL-10 — Parc: cerere → alocare → foaie/FAZ → carburant/mentenanță

- **Actor:** Șef departament, Dispecer, Șofer/Mecanic.
- **Pași:** cerere resursă → planificare/alocare → deschidere foaie/FAZ → kilometraj/activitate → alimentare/consum/intervenție → închidere → scadențe și raport.
- **Rezultat:** timeline complet pe resursă și sold carburant estimat.
- **Excepții:** suprapunere, odometru regresiv, rezervor/capacitate lipsă, document expirat.
- **Stare:** Confirmat în cod; UAT dispozitiv mobil/PWA obligatoriu.

## FL-11 — Logistică: planificare → execuție → livrare

- **Actor:** Dispecer, Șofer/Operator, Manager.
- **Pași:** creare cursă → traseu și alocări → legare comandă/contract → aviz/CMR → plecare/sosire efective → dovadă foto/PDF → confirmare livrare → cost manual și raport.
- **Rezultat:** trasabilitate cursă-document-livrare.
- **Excepții:** resurse indisponibile, document lipsă, fișier invalid, livrare întârziată.
- **Limită:** fără transmitere automată RO e-Transport/ANAF; evidența este informativă/manuală.
- **Stare:** Confirmat în cod; UAT operațional obligatoriu.

## FL-12 — HR: angajat → contract → pontaj/concediu → raportare

- **Actor:** HR Manager, Angajat, Șef departament.
- **Pași:** creare angajat → contract → legare cont → pontaj/ture → validare/aprobare → cereri concediu → diagnostic registru → export intern/REGES pentru profil România.
- **Rezultat:** istoric de muncă și raportări pregătite pe date validate.
- **Excepții:** cont nelegat, perioadă blocată, pontaj invalidat, contract suprapus, câmpuri obligatorii lipsă.
- **Stare:** Confirmat parțial prin cod și teste focalizate; UAT end-to-end obligatoriu.

## FL-13 — Contabilitate: factură → postare → bancă → reconciliere → închidere

- **Actor:** Contabil.
- **Pași:** terț → factură/linii/TVA → validare și postare → note/registru → import extras → reconciliere → rapoarte → închidere perioadă/an.
- **Rezultat:** documente și registre coerente, perioadă controlată.
- **Excepții:** dezechilibru, cont lipsă, perioadă închisă, duplicat bancar, diferență nereconciliată.
- **Stare:** Implementare identificată și teste contabile existente; UAT fiscal și MSSQL obligatoriu.

## FL-14 — Tichet P1–P4 → SLA → rezolvare

- **Actor:** Solicitant, Agent, Manager suport.
- **Pași:** creare → prioritate → alocare → comentarii/atașamente → calcul termen L–V 09:00–17:00 → escaladare → rezolvare/închidere.
- **Rezultat:** istoric, responsabil și verdict SLA.
- **Excepții:** prioritate incorectă, atașament invalid, termen în afara programului, tranziție invalidă.
- **Stare:** Confirmat în cod; UAT de timp și fus orar obligatoriu.

## FL-15 — Bibliotecă Ajutor: redactare → publicare → transfer client

- **Actor:** Superadmin; utilizator pentru citire.
- **Pași:** creare articol → categorie/conținut/imagine → activare → căutare de utilizator → export ZIP → backup bibliotecă țintă → import în instalația client → verificare.
- **Rezultat:** ajutor local portabil și căutabil.
- **Excepții:** imagine peste 3 MB/format invalid, ZIP/manifest invalid, import care înlocuiește biblioteca.
- **Stare:** Confirmat în cod; UAT export/import cu rollback obligatoriu.

## Matrice de prioritate UAT

| Prioritate | Fluxuri | Motiv |
|---|---|---|
| P0 | FL-01, FL-03, FL-07, FL-08, FL-12, FL-13 | configurare, decizii, date sensibile/financiare |
| P1 | FL-04, FL-05, FL-06, FL-09, FL-10, FL-11 | integrare între module și documente reale |
| P2 | FL-02, FL-14, FL-15 | productivitate, suport și documentație |

Au fost identificate **15 fluxuri funcționale end-to-end**.

