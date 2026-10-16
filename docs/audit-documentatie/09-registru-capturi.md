# Registru capturi pentru documentația InfraFlow

## Reguli generale

- Capturile se fac la rezoluție desktop 1440 × 900 și, unde este indicat, mobil 390 × 844.
- Se folosesc exclusiv date fictive. Se maschează emailuri reale, CUI, IBAN, tokenuri, chei API, parole, numere de telefon și documente încărcate.
- Bara de adresă, notificările sistemului și filele fără legătură se exclud.
- Captura trebuie refăcută dacă denumirea, poziția controlului sau fluxul se schimbă.
- Pentru fiecare articol se păstrează cel mult o captură per pas care chiar are nevoie de orientare vizuală.

| ID | Modul / articol asociat | Ecran exact | Ce trebuie să surprindă | Acțiune vizibilă | Rol recomandat | Date de mascat | Prioritate |
|---|---|---|---|---|---|---|---|
| CAP-001 | Onboarding / Prima configurare | Wizard instalare | profil organizație, țară, monedă și indicatorul pasului | Continuă | Superadmin | CUI, email | Critică |
| CAP-002 | Onboarding / Module | Setări → Administrare module | categoriile pliate, rezumatul și comutatorul unui modul | Salvează module | Superadmin | — | Critică |
| CAP-003 | Utilizatori | Setări → Utilizatori | formularul utilizatorului, rolul, departamentul și starea | Salvează | Superadmin | email, telefon | Critică |
| CAP-004 | Roluri | Setări → Roluri și permisiuni | rolul selectat, grupurile și permisiunile granulare | Salvează rol | Superadmin | nume reale | Critică |
| CAP-005 | Dashboard | Dashboard | meniul, căutarea globală, Primii pași și cardurile relevante | Deschide modul | Utilizator standard | date KPI reale | Mare |
| CAP-006 | CRM / Lead | CRM / Vânzări → Lead-uri | lista, filtrele și butonul de creare | Lead nou | Vânzări | contacte reale | Critică |
| CAP-007 | CRM / Conversie | Fișă lead | datele leadului, activitățile și acțiunea de conversie | Convertește | Vânzări | email, telefon | Critică |
| CAP-008 | CRM / Ofertă | Formular creare ofertă | clientul, liniile, moneda, discountul, TVA și salvarea | Salvează draft | Vânzări | date client | Critică |
| CAP-009 | CRM / Aprobare | Detaliu ofertă | revizia, totalul, starea și acțiunea de aprobare | Aprobă | Manager comercial | date client | Mare |
| CAP-010 | CRM / Trimitere | Detaliu ofertă aprobată | preview, expirare, email și trimitere | Trimite oferta | Vânzări | email client | Mare |
| CAP-011 | Contracte | Fișă contract | trasabilitatea CRM, documentele, termenele și starea | Activează | Manager | client, valori | Critică |
| CAP-012 | Documente | Inbox Documente | filtrele rapide, selecția multiplă și starea circuitului | Deschide dosar | Utilizator cu acces | titluri sensibile | Mare |
| CAP-013 | Documente | Dosar document | pașii circuitului, responsabilul, auditul și acțiunile | Aprobă / Respinge | Aprobator | autori, fișiere | Critică |
| CAP-014 | Stocuri | Materiale / Nomenclator | căutarea, stocul și acțiunile autorizate | Material nou | Gestionar | prețuri reale | Mare |
| CAP-015 | Gestiune | NIR | furnizorul, liniile, cantitățile și documentul-sursă | Înregistrează NIR | Gestionar | furnizor, factură | Critică |
| CAP-016 | Achiziții | Comandă achiziție | necesarul, furnizorul, liniile și legătura CRM/contract | Salvează | Achiziții | prețuri, furnizor | Mare |
| CAP-017 | Referate | Detaliu referat | pozițiile, circuitul configurat și aprobările | Trimite în circuit | Solicitant | valori, nume | Mare |
| CAP-018 | Lucrări / Execuție | Dashboard lucrări | indicatorii generici și filele Lucrări/Rapoarte/Progres/Consum | Lucrare nouă | Manager operațional | client, amplasament | Mare |
| CAP-019 | Producție / Operațiuni | Plan / consum | unitatea de măsură, cantitatea și materialele | Înregistrează | Operator | rețete/confidențial | Medie |
| CAP-020 | Parc & Resurse | Fișă resursă | date tehnice, scadențe, combustibil și timeline | Editează | Mecanizare | număr auto, serie | Mare |
| CAP-021 | Parc & Resurse | Planificare | cererea, resursa, perioada și responsabilul | Alocă | Dispecer | șofer, număr auto | Mare |
| CAP-022 | Logistică | Cursă planificată | traseul, vehiculul, șoferul, documentele și costul | Pornește cursa | Dispecer | adrese, număr auto | Critică |
| CAP-023 | Logistică | Confirmare livrare | sosirea, dovada foto/PDF și istoricul | Confirmă livrarea | Dispecer | semnătură, adresă | Mare |
| CAP-024 | HR | Fișă angajat | datele de bază, contractul și diagnosticul registrului | Salvează | HR | toate datele personale | Critică |
| CAP-025 | HR | Pontaj lunar | luna, angajații, orele și validarea | Validează pontaj | HR / Manager | nume, absențe | Critică |
| CAP-026 | Contabilitate | Factură contabilă | terțul, liniile, TVA, scadența și starea postării | Postează | Contabil | CUI, IBAN, valori | Critică |
| CAP-027 | Contabilitate | Trezorerie / Reconciliere | extrasul, potrivirile și diferențele | Confirmă reconcilierea | Contabil | IBAN, tranzacții | Mare |
| CAP-028 | Tichete | Fișă solicitare | prioritatea P1–P4, SLA, responsabilul și comentariile | Rezolvă | Agent suport | solicitant, atașamente | Mare |
| CAP-029 | Ajutor | Biblioteca Ajutor | căutarea, categoriile și articolul extins | Deschide articol | Utilizator | — | Mare |
| CAP-030 | Ajutor administrare | Editor articol | categorie, titlu, conținut, stare și încărcare imagine | Salvează articol | Superadmin | imagini cu date reale | Critică |
| CAP-031 | Securitate | Setări → Securitate | checklistul, sesiunile și jurnalul filtrat | Închide sesiune | Superadmin | IP, utilizator | Mare |
| CAP-032 | Backup / update | Setări → Actualizare | versiunea, verificarea pachetului și avertizarea de restart | Aplică update | Superadmin | căi/tokenuri | Critică |
| CAP-033 | Mobil | Kiosk Angajat | acțiunile permise și identificarea utilizatorului | Intrare / Ieșire | Angajat | nume, locație | Medie |
| CAP-034 | Mobil | Foaie parcurs PWA | traseul, kilometrajul și semnătura | Încheie foaia | Șofer | locații, semnătură | Medie |

## Ordinea producerii capturilor

1. CAP-001–CAP-005 pentru instalare și acces.
2. CAP-006–CAP-013 pentru fluxurile comerciale și documentare.
3. CAP-014–CAP-027 pentru operațiunile pe module.
4. CAP-028–CAP-034 pentru suport, administrare și mobil.

