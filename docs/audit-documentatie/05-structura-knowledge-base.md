# Structura propusă pentru Knowledge Base InfraFlow

Audit sursă: **v2.12.705**. Structura de mai jos este o propunere editorială; aplicația are deja pagina autentificată **Ajutor**, cu articole, căutare, imagine și export/import ZIP, dar nu are un portal public separat confirmat.

## PUBLIC

| ID | Categorie | Articol propus |
|---|---|---|
| IF-PUB-001 | Introducere | Ce este InfraFlow și cum este organizat modular |
| IF-PUB-002 | Introducere | Cerințe generale pentru utilizarea web și desktop |
| IF-PUB-003 | Ghiduri generale | Autentificarea și alegerea organizației/instalației |
| IF-PUB-004 | Ghiduri generale | Navigarea, meniul lateral, filele și căutarea globală |
| IF-PUB-005 | FAQ | De ce nu văd un modul sau o acțiune |
| IF-PUB-006 | Troubleshooting | Server indisponibil și verificări accesibile utilizatorului |
| IF-PUB-007 | Troubleshooting | Fișierul nu se descarcă sau nu se deschide |

**Stare:** propunere. Ruta publică dedicată Knowledge Base nu a fost identificată. `/ajutor` este randată în shell-ul autentificat (`client/src/App.jsx`, `HelpPage.jsx`).

## UTILIZATOR AUTENTIFICAT

| ID categorie | Categorie | Subcategorii/articole inițiale |
|---|---|---|
| IF-USR-CORE | Utilizare generală | Dashboard; notificări; Task-uri; căutare; file de lucru |
| IF-USR-HR | Resurse Umane | profil propriu; pontaj; concedii; documente; instruiri |
| IF-USR-INV | Stocuri & Depozite | materiale; NIR; bon consum; transfer; inventar; rapoarte |
| IF-USR-PROD | Producție & Operațiuni | rețete; plan; realizare; consum; raport |
| IF-USR-FLT | Flotă, Echipamente & Resurse | catalog; cereri; planificare; foi parcurs; FAZ; mentenanță |
| IF-USR-WRK | Lucrări / Execuție | lucrări; rapoarte zilnice; progres; output; export |
| IF-USR-PRC | Aprovizionare & Achiziții | necesar; comenzi; recepții; PAAP; CPV |
| IF-USR-LOG | Logistică & Transport | curse; resurse; documente; livrare; dovezi; raport |
| IF-USR-CTR | Contracte | dosar; surse; consum; alerte; task-uri; închidere |
| IF-USR-CRM | CRM / Vânzări | lead; prospect/contact; ofertă; acceptare; comandă; facturare draft |
| IF-USR-DOC | Documente | creare; lansare; aprobare; semnare; urmărire; arhivare |
| IF-USR-COM | Mesaje și solicitări | canale; fișiere; Tichete P1–P4; rezolvare |
| IF-USR-ACC | Contabilitate | terți; facturi; trezorerie; operațiuni; jurnale; rapoarte; închidere |
| IF-USR-SVC | Servicii operaționale | teren; rute; semnalizare; mediu; operațiuni sezoniere |

## ADMINISTRATOR CLIENT

| ID | Categorie | Articol propus |
|---|---|---|
| IF-ADM-001 | Organizație | Configurarea profilului organizației |
| IF-ADM-002 | Module | Activarea modulelor licențiate |
| IF-ADM-003 | Utilizatori | Crearea și dezactivarea utilizatorilor |
| IF-ADM-004 | Roluri | Roluri implicite, roluri configurabile și resetarea lor |
| IF-ADM-005 | Permisiuni | Acordarea permisiunilor punctuale și verificarea accesului |
| IF-ADM-006 | Departamente | Configurarea departamentelor și asocierea utilizatorilor |
| IF-ADM-007 | Workflow | Șabloane și pași pentru circuitul documentelor |
| IF-ADM-008 | Integrări | Configurarea emailului și integrarea permisă de instalare |
| IF-ADM-009 | Securitate | 2FA, sesiuni, parole și stații autorizate |
| IF-ADM-010 | Continuitate | Backup, restore și verificarea actualizărilor |
| IF-ADM-011 | Ajutor | Importul bibliotecii Ajutor furnizate de InfraFlow |

## ECHIPA INFRAFLOW

| ID | Categorie | Articol/procedură propusă |
|---|---|---|
| IF-INT-001 | Implementare | Checklist instalare Windows cu SQL Server |
| IF-INT-002 | Implementare | Checklist instalare Linux hosted |
| IF-INT-003 | Onboarding | Colectarea profilului și selectarea pachetului comercial |
| IF-INT-004 | Migrare | Evaluare, mapare, import și reconciliere date vechi |
| IF-INT-005 | Training | Plan de training administrator client |
| IF-INT-006 | Training | Plan de training utilizatori pe roluri |
| IF-INT-007 | Go-live | Criterii de acceptanță și plan de revenire |
| IF-INT-008 | Suport | Triage P1–P4 și informații necesare într-un tichet |
| IF-INT-009 | Release | Build, verificare, semnare, publicare și rollback update |
| IF-INT-010 | Tehnic | Arhitectură, storage, MSSQL, permisiuni și audit |

## Reguli editoriale recomandate

- Un articol tratează un singur rezultat verificabil.
- ID-ul rămâne stabil chiar dacă titlul se schimbă.
- Fiecare articol indică versiunea InfraFlow și permisiunea minimă.
- Articolele dependente de țară se etichetează cu jurisdicția; România nu devine regulă globală.
- Publicarea se face după verificare pe rolul minim, nu doar ca superadmin.
- Exportul/importul existent (`/help/export`, `/help/import`) poate transfera biblioteca autentificată între instalații; segmentarea PUBLIC/ADMIN/INTERN nu este încă modelată în schema curentă.

## Dovezi

- Catalog module: `server/core/module-catalog.js`.
- Navigare: `client/src/components/layout/Sidebar.jsx`, `client/src/App.jsx`.
- Ajutor existent: `client/src/pages/HelpPage.jsx`, `server/modules/system/help-routes.js`.

