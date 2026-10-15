# Onboarding și training — inventar funcțional

Versiune analizată: **v2.12.705**. Nu sunt estimate durate.

| Etapă | Permite aplicația | Manual / echipa InfraFlow | Neconfirmat | Documentație necesară |
|---|---|---|---|---|
| 1. Configurare inițială | Wizard `/setup`, profil organizație, stație, utilizator inițial și licență trial; finalizare auditată | Pregătire SQL Server, runtime, domeniu/tunel și secrete | Instalare complet nesupravegheată pe toate mediile | IF-INT-001/002; IF-ADM-001 |
| 2. Creare utilizatori | Administrare în Setări; limită de licență și stare activă/inactivă | Stabilirea titularilor și datelor corecte | Import în masă utilizatori nu a fost confirmat | IF-ADM-003 |
| 3. Stabilire roluri | Roluri built-in, roluri implicite configurabile, roluri custom și permisiuni punctuale | Matricea de responsabilități se aprobă cu clientul | Echivalența fiecărui rol custom între instalații | IF-ADM-004/005 |
| 4. Activare module | Administrare module pe categorii; filtrare prin licență și `effectiveEntitlements` | Alegerea pachetului și validarea dependențelor | Recomandare automată completă după industrie | IF-ADM-002 |
| 5. Import date | `Import date vechi`; importuri specifice în module (Excel/XML/CSV/e-Factura, după caz) | Mapare, curățare, backup și reconciliere | Acoperirea tuturor entităților și formatelor clientului | IF-INT-004 plus articole per import |
| 6. Training administratori | Setări, utilizatori, roluri, module, workflow, securitate, backup, update, Ajutor | Sesiune practică și scenariu de recuperare | Validare formală de competență | IF-INT-005 și seria IF-ADM |
| 7. Training utilizatori | Dashboard, „Primii pași”, Ajutor și fluxuri pe module/permisiuni | Conturi și date de exercițiu fără date personale | Curriculum automat adaptat rolului | IF-INT-006 și articole IF-USR |
| 8. Testare | Demo, teste automate în repo și date fictive; rolurile pot fi simulate manual | UAT pe scenarii, reconciliere și acceptanță semnată | Comportamentul fiecărei funcții în mediul client | Checklist UAT per modul |
| 9. Go-live | Backup, diagnostic securitate, update și health endpoint | Fereastră de schimbare, validare DB, DNS/tunel, plan rollback | Automatizarea completă a cutover-ului | IF-INT-007 |
| 10. Suport post-implementare | Tichete P1–P4, notificări, audit, Ajutor actualizabil/importabil | Monitorizare, triere și actualizare Knowledge Base | SLA contractual concret pentru fiecare client | IF-INT-008 |

## Funcții existente care susțin onboardingul

- Checklist „Primii pași și configurare” pe Dashboard (`DashboardPage.jsx`).
- Asistent de configurare și progres în Setări (`SetariPage.jsx`).
- Wizard inițial și `/setup/complete` (`SetupWizardPage.jsx`, `server/core/setup.js`).
- Catalog de pachete și module (`server/core/module-catalog.js`).
- Bibliotecă Ajutor portabilă prin ZIP (`HelpPage.jsx`, `help-routes.js`).
- Diagnostic de securitate, sesiuni și update în Setări (`SetariPage.jsx`, rutele System).

## Separarea responsabilităților

- **Administrator client:** utilizatori, roluri, module permise, profil, workflow și configurări expuse în UI.
- **Echipa InfraFlow:** instalare, secrete, MSSQL, migrare controlată, publicarea update-urilor și intervențiile care nu sunt expuse în UI.
- **Utilizator final:** activitățile permise de rol; nu trebuie instruit pe opțiuni pe care nu le vede.

## Aspecte NECONFIRMATE – necesită testare

1. Parcurgerea completă a wizardului pe instalare Windows curată și Linux curată.
2. Persistența fiecărei setări după restart și update.
3. Importul unui set real anonim pentru fiecare adaptor disponibil.
4. UAT pe rol minim pentru fiecare modul activat.
5. Restore complet pe o mașină diferită.
6. Transferul bibliotecii Ajutor între versiuni diferite ale aplicației.

