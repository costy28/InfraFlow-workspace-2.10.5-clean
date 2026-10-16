# Inventar operațiuni

## Convenții

- **Confirmat în cod**: există rută/interfață/permisiune identificabilă; nu înseamnă că a fost executată live în acest audit.
- **UAT**: trebuie probat în instalație MSSQL cu rolul menționat.
- Erorile exacte din interfață trebuie copiate în articol numai după UAT; aici sunt descrise categoriile de eșec, fără mesaje inventate.

| ID | Modul | Operațiune exactă | Scop / precondiții | Rezultat așteptat | Eșecuri de tratat | Rol minim orientativ | Dovadă / stare |
|---|---|---|---|---|---|---|---|
| OP-001 | Core | Autentificare | cont activ și parolă validă | sesiune și module efective încărcate | cont inactiv, parolă greșită, expirare Demo | utilizator | auth; confirmat în cod, UAT |
| OP-002 | Core | Confirmare TOTP | TOTP activ și cod curent/recuperare | autentificare finalizată | cod invalid/reutilizat | Superadmin cu 2FA | auth; confirmat în cod, UAT |
| OP-003 | Core | Închidere sesiune proprie | utilizator autentificat | sesiunea devine invalidă | sesiune deja expirată | utilizator | auth; confirmat în cod |
| OP-004 | Core | Citire notificări | sesiune și permisiuni/module active | listă contextuală | referință indisponibilă | utilizator | API notificări; confirmat în cod |
| OP-005 | Dashboard | Căutare globală | pagini/module accesibile | rezultate filtrate după drepturi | zero rezultate/modul inactiv | utilizator | search/nav; confirmat în cod |
| OP-006 | Setări | Salvare profil organizație | drept administrativ | țară, limbă, monedă și date companie persistate | câmp invalid/lipsă | Superadmin | settings; confirmat în cod, UAT |
| OP-007 | Setări | Activare/dezactivare modul | licență și drepturi efective | catalog activ actualizat | modul nelicențiat/dependență | Superadmin | module catalog; confirmat în cod |
| OP-008 | Setări | Creare utilizator | rol/departament valide | cont creat și auditat | username/email duplicat | Superadmin/Admin autorizat | users; confirmat în cod |
| OP-009 | Setări | Modificare rol și permisiuni | rol editabil | drepturi efective recalculate | rol sistem protejat/permisie invalidă | Superadmin | permissions; confirmat în cod |
| OP-010 | Setări | Închidere sesiune activă | sesiune țintă identificată | accesul țintei revocat | sesiune absentă | Superadmin | security; confirmat în cod |
| OP-011 | Stocuri | Creare material | categorie și unitate valide | nomenclator actualizat | duplicat/validare | Gestionar | materials; confirmat în cod |
| OP-012 | Gestiune | Înregistrare NIR | furnizor/document/linii valide | intrare stoc și trasabilitate | cantitate invalidă/document duplicat | Gestionar/Magaziner | gestiune; confirmat în cod, UAT |
| OP-013 | Gestiune | Emitere bon consum | stoc disponibil și destinație | ieșire stoc înregistrată | stoc insuficient/permisie | Gestionar/Magaziner | gestiune; confirmat în cod, UAT |
| OP-014 | Stocuri | Transfer între depozite/departamente | stoc sursă și destinație | mișcare trasabilă | stoc insuficient/destinație invalidă | Gestionar | inventory; confirmat în cod |
| OP-015 | Gestiune | Inventariere și regularizare | sesiune inventar | diferențe calculate/aplicate controlat | inventar deschis/conflict | Gestionar | gestiune; confirmat în cod, UAT |
| OP-016 | Stocuri | Export raport stoc | drept raport/export | fișier Excel/CSV | set gol/generare eșuată | Gestionar/Contabil | export; confirmat în cod |
| OP-017 | Producție | Creare/editare rețetă | nomenclator materiale | rețetă/versionare persistată | material lipsă/cantități invalide | Operator autorizat/Tehnic | recipes; confirmat în cod |
| OP-018 | Producție | Creare plan operațional | perioadă și poziții valide | plan disponibil execuției | suprapunere/date invalide | Manager/Operator autorizat | production; confirmat în cod |
| OP-019 | Producție | Înregistrare consum | rețetă/materiale/stoc disponibile | consum și cantități persistate | stoc insuficient/unitate invalidă | Operator servicii | consumptions; confirmat în cod, UAT |
| OP-020 | Producție | Export consumuri | perioadă și drept export | fișier de raport | set gol/generare | Contabil/Tehnic | consumptions export; confirmat în cod |
| OP-021 | Achiziții | Creare referat | solicitant, poziții și circuit configurat | draft referat | nomenclator/valoare invalidă | Solicitant/Șef departament | referate; confirmat în cod |
| OP-022 | Achiziții | Trimitere referat în circuit | referat complet | snapshot pași și stare în aprobare | circuit invalid/lipsă aprobator | Solicitant | workflow referate; confirmat în cod, UAT |
| OP-023 | Achiziții | Aprobare/respingere referat | pas curent și drept aferent | pas auditat, flux continuat/oprit | utilizator neeligibil/stare schimbată | Aprobator configurat | referate; confirmat în cod, UAT |
| OP-024 | Achiziții | Creare comandă furnizor | furnizor și linii valide | comandă draft/emisă | furnizor lipsă/valori invalide | Achiziții | procurement orders; confirmat în cod |
| OP-025 | Achiziții | Recepție comandă | comandă deschisă și cantități | recepție legată și stoc pregătit | depășire/neconcordanță | Gestionar/Achiziții | deliveries; confirmat în cod, UAT |
| OP-026 | Achiziții | Închidere comandă | recepții finalizate | comandă închisă | diferențe restante | Gestionar/Achiziții | procurement; confirmat în cod |
| OP-027 | CRM | Creare lead | date minime contact | lead nou și audit | duplicat/date invalide | Vânzări | CRM routes/pages; confirmat în cod |
| OP-028 | CRM | Conversie lead | lead eligibil | prospect și contact legați | conversie anterioară/conflict | Vânzări | CRM; confirmat în cod, UAT |
| OP-029 | CRM | Înregistrare activitate/follow-up | lead/prospect/contact existent | activitate și task opțional | referință lipsă/termen invalid | Vânzări | CRM/task; confirmat în cod |
| OP-030 | CRM | Creare ofertă draft | client și linii; monedă/TVA/discount | ofertă versionată | valori/monedă invalide | Vânzări | offers; confirmat în cod |
| OP-031 | CRM | Aprobare ofertă | draft complet | stare aprobată și audit | revizie/stare conflict | Manager comercial | CRM offers; confirmat în cod |
| OP-032 | CRM | Trimitere ofertă publică | ofertă aprobată și email/configurare | link securizat expediat | SMTP/token/expirare | Vânzări | public offer; confirmat în cod, integrare UAT |
| OP-033 | CRM | Acceptare/respingere ofertă | token public valid | decizie client auditată | token invalid/expirat/revocat | Client extern | public route; confirmat în cod, UAT |
| OP-034 | CRM | Generare comandă client | ofertă acceptată | comandă idempotentă cu snapshot | comandă deja creată/stare neeligibilă | Vânzări | CRM order; confirmat în cod |
| OP-035 | CRM | Emitere proformă/draft factură | comandă confirmată și terț legat | document intern pregătit | terț lipsă/duplicat | Vânzări/Contabil | CRM-accounting; confirmat în cod, UAT |
| OP-036 | CRM | Emitere manuală Oblio | configurare testată și confirmare explicită | factură externă legată idempotent | provider indisponibil/date invalide | Contabil/Superadmin configurator | Oblio; cod confirmat, live neconfirmat |
| OP-037 | Contracte | Creare contract draft din comandă | comandă CRM confirmată | contract draft cu trasabilitate | contract existent/date incomplete | Manager comercial | contracts; confirmat în cod |
| OP-038 | Contracte | Activare contract | dosar complet și document semnat | contract activ | document/termene lipsă | Manager | contracts; confirmat în cod, UAT |
| OP-039 | Contracte | Legare document-sursă | contract și comandă/recepție eligibilă | consum/trasabilitate actualizată | referință duplicată/neeligibilă | Manager/Contract owner | contracts; confirmat în cod |
| OP-040 | Contracte | Închidere contract | obligații și documente finalizate | stare închisă și raport | alerte/taskuri/deschideri restante | Manager | contracts; confirmat în cod, UAT |
| OP-041 | Documente | Creare document | tip și metadate valide | dosar draft | tip inactiv/câmp lipsă | Creator document | documents; confirmat în cod |
| OP-042 | Documente | Lansare în workflow | șablon aplicabil | snapshot pași/reguli | șablon invalid/diagnostic negativ | Creator/Manager | workflow; confirmat în cod, UAT |
| OP-043 | Documente | Aprobare/respingere pas | responsabil eligibil | decizie auditată și pas următor | concurență/utilizator neeligibil | Aprobator | documents workflow; confirmat în cod |
| OP-044 | Documente | Acțiune în masă | selecție și drept comun | operațiune aplicată elementelor eligibile | selecție mixtă/conflict | Utilizator autorizat | documents bulk; confirmat în cod |
| OP-045 | Documente | Urmărire/watchlist | acces la document | alerte și activitate urmărită | document inaccesibil | Utilizator autorizat | watchlist; confirmat în cod |
| OP-046 | Parc & Resurse | Creare/editare resursă | date tehnice minime | fișă resursă | identificator duplicat | Mecanizare/Gestionar parc | fleet; confirmat în cod |
| OP-047 | Parc & Resurse | Planificare resursă | cerere, disponibilitate și perioadă | alocare | suprapunere/indisponibil | Dispecer | planning; confirmat în cod, UAT |
| OP-048 | Parc & Resurse | Deschidere/închidere foaie parcurs | vehicul și șofer alocați | traseu/kilometraj auditat | odometru invalid/foaie deschisă | Șofer | fleet trip log; confirmat în cod, UAT |
| OP-049 | Parc & Resurse | Înregistrare carburant/intervenție | resursă existentă | timeline și sold estimat actualizate | capacitate/date invalide | Mecanic/Operator | fleet/mechanization; confirmat în cod |
| OP-050 | Logistică | Planificare cursă | traseu, vehicul, șofer și legături | cursă planificată | conflict resurse/date lipsă | Dispecer | logistics; confirmat în cod |
| OP-051 | Logistică | Plecare/sosire efectivă | cursă în stare eligibilă | timpi efectivi și audit | ordine/stare invalidă | Dispecer/Operator | logistics execution; confirmat în cod |
| OP-052 | Logistică | Încărcare dovadă livrare | livrare și fișier acceptat | dovadă autorizată asociată | tip/mărime/acces invalid | Dispecer | logistics files; confirmat în cod |
| OP-053 | Logistică | Confirmare livrare | sosire și dovezi după caz | livrare confirmată | date obligatorii lipsă | Dispecer/Manager | logistics; confirmat în cod, UAT |
| OP-054 | HR | Creare/editare angajat | drept HR și date obligatorii | fișă și diagnostic actualizate | CNP/date/contract conflict | HR Manager | HR; confirmat în cod, UAT date sensibile |
| OP-055 | HR | Înregistrare contract angajat | angajat și perioadă valide | contract activ/istoric | suprapunere/câmpuri obligatorii | HR Manager | HR contracts; confirmat în cod |
| OP-056 | HR | Completare pontaj | perioadă deschisă și angajat eligibil | ore salvate | perioadă blocată/ore invalide | Angajat/Șef/HR după scop | timesheets; confirmat în cod, UAT |
| OP-057 | HR | Validare/aprobare pontaj | pontaj complet și drept | stare validată/aprobată | modificare concurentă/lipsuri | HR Manager/Manager | HR timesheets; confirmat în cod, UAT |
| OP-058 | HR | Cerere/aprobare concediu | sold/perioadă și flux | cerere și decizie auditate | suprapunere/sold insuficient | Angajat/Manager/HR | leave; confirmat în cod, UAT |
| OP-059 | HR | Export registru intern/REGES | profil România, diagnostic fără blocaje | fișier export și istoric | câmpuri obligatorii/profil neeligibil | HR Manager | HR reporting; confirmat în cod, conformitate live neconfirmată |
| OP-060 | Contabilitate | Creare terț | identificare fiscală și date minime | terț contabil | duplicat/date fiscale invalide | Contabil | accounting parties; confirmat în cod |
| OP-061 | Contabilitate | Creare/postare factură | terț, linii, perioadă și conturi valide | document postat și note aferente | perioadă închisă/dezechilibru | Contabil | accounting invoices; confirmat în cod, UAT |
| OP-062 | Contabilitate | Import extras bancar | format și cont bancar configurat | tranzacții importate | format/duplicat | Contabil | treasury; confirmat în cod, UAT format |
| OP-063 | Contabilitate | Reconciliere tranzacție | tranzacție și document eligibil | potrivire confirmată | diferență/reconciliere anterioară | Contabil | treasury; confirmat în cod, UAT |
| OP-064 | Contabilitate | Închidere perioadă/an | verificări contabile trecute | perioadă blocată/închidere auditată | solduri/nepostate | Contabil autorizat | accounting closing; confirmat în cod, UAT critic |
| OP-065 | Mesaje | Trimitere mesaj/fișier | membru canal și fișier acceptat | mesaj vizibil membrilor | acces/tip/mărime fișier | Utilizator cu send | messaging; confirmat în cod |
| OP-066 | Tichete | Creare tichet P1–P4 | categorie, descriere, prioritate | tichet și țintă SLA | date insuficiente/atașament | Utilizator | tickets; confirmat în cod |
| OP-067 | Tichete | Alocare/escaladare/rezolvare | drept și stare eligibilă | istoric și notificări | tranziție invalidă | Agent/Manager | tickets; confirmat în cod, UAT SLA |
| OP-068 | Ajutor | Căutare/citire articol | autentificare | articol filtrat după text/categorie/stare | fără rezultate | Utilizator | HelpPage/API; confirmat în cod |
| OP-069 | Ajutor | Creare/editare articol cu imagine | Superadmin; imagine PNG/JPG/WEBP max 3 MB | articol salvat | format/mărime/validare | Superadmin | help routes; confirmat în cod |
| OP-070 | Ajutor | Export/import bibliotecă ZIP | Superadmin și arhivă validă | bibliotecă transferată | manifest invalid/import înlocuitor | Superadmin | help export/import; confirmat în cod, UAT backup |
| OP-071 | Sistem | Backup/restore | drept sistem și destinație disponibilă | copie/restaurare controlată | spațiu/permisiuni/incompatibilitate | Superadmin | system; confirmat în cod, UAT critic |
| OP-072 | Sistem | Verificare/aplicare update | pachet verificat, platformă/licență eligibilă | versiune nouă și health check | checksum, restart, health, rollback | Superadmin | updater; confirmat în cod, UAT Windows/Linux |

## Concluzie inventar

Au fost identificate **72 de operațiuni documentabile**. Lista este orientată spre acțiuni de utilizator și administrator, nu spre numărul brut de endpointuri. Operațiunile de ștergere definitivă, import masiv, postare contabilă, restore și update trebuie documentate cu avertizare, confirmare și procedură de revenire.

