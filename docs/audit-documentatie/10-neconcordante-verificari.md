# Neconcordanțe și verificări necesare

Acest registru separă clar ceea ce este confirmat în cod de ceea ce necesită validare într-o instalație reală. Niciun element marcat **NECONFIRMAT** nu trebuie prezentat clientului ca funcție garantată.

| ID | Aspect | Observație bazată pe cod | Risc pentru documentație/onboarding | Verificarea necesară | Stare |
|---|---|---|---|---|---|
| NC-01 | Ajutor public | Ruta și pagina Ajutor identificate cer autentificare; nu a fost identificat un portal public separat. | Articolele pentru vizitatori nu pot fi promise. | Test anonim pe `/ajutor` și decizie produs privind portalul public. | NECONFIRMAT |
| NC-02 | Metadate editoriale Ajutor | Modelul curent gestionează categorie, titlu, conținut, imagine și stare, dar nu s-au confirmat audiență, versiune, autor editorial și dată de revizie ca metadate dedicate. | Guvernanța conținutului poate rămâne manuală. | Inspectarea payloadului persistat și definirea schemei editoriale dorite. | NECONFIRMAT |
| NC-03 | Import Ajutor | Importul ZIP pare să înlocuiască biblioteca, nu să facă merge controlat. | Se pot pierde articole locale ale clientului. | Test export–modificare locală–import și politică de conflict/rollback. | NECONFIRMAT |
| NC-04 | Compatibilitate bibliotecă Ajutor | Formatul identificat este `infraflow-help-library-v1`; nu este demonstrată migrarea versiunilor viitoare. | Pachetele vechi/noi pot fi incompatibile. | Test de compatibilitate și validare explicită a versiunii manifestului. | NECONFIRMAT |
| NC-05 | Paritate Web/PWA/Electron | Există frontend web, PWA și launcher Electron, dar auditul static nu dovedește paritatea tuturor acțiunilor. | Capturile și pașii pot diferi pe platformă. | Matrice UAT pe Windows web, Electron și mobil/PWA. | NECONFIRMAT |
| NC-06 | Fluxuri publice cu token | Ofertele publice, invitațiile Demo și partajările folosesc tokenuri, însă ciclul complet expirare/revocare nu a fost rulat în acest audit. | Instrucțiunile externe pot omite cazuri-limită. | UAT cu token valid, expirat, revocat și reutilizat. | NECONFIRMAT |
| NC-07 | Import date vechi | Suprafața există, dar formatele, limitele și mapările acceptate nu au fost inventariate exhaustiv. | Clientul poate pregăti fișiere greșite. | Inventar pe fiecare importer și fișiere-etalon validate. | NECONFIRMAT |
| NC-08 | Integrări externe live | GPS, Oblio, ANAF/SPV, WhatsApp, SMTP și IMAP au cod/configurare, dar disponibilitatea serviciilor externe nu rezultă din sursă. | Onboardingul poate promite un traseu imposibil fără credențiale/licență. | Test separat cu conturi sandbox sau reale autorizate. | NECONFIRMAT |
| NC-09 | AI și limitele datelor | Modulul AI este opțional; providerul, modelele și politica de date trebuie confirmate per client. | Risc de confidențialitate și cost. | Revizie DPA, configurare provider, permisiuni și jurnalizare prompturi. | NECONFIRMAT |
| NC-10 | Roluri personalizate portabile | Rolurile implicite sunt în cod, dar portarea rolurilor custom între instalații nu a fost confirmată. | Configurarea repetată poate fi manuală. | Test export/backup–restore pe roluri și permisiuni custom. | NECONFIRMAT |
| NC-11 | Denumiri catalog vs UI | Catalogul canonic include denumiri precum `Contract Management`/`CRM / Sales Automation`, iar UI folosește `Contracte`/`CRM / Vânzări`. | Căutarea și documentația pot folosi termeni diferiți. | Alegerea unui glosar canonic și alinierea etichetelor. | DE CORECTAT DOCUMENTAR |
| NC-12 | Aliasuri și rute legacy | Catalogul păstrează aliasuri și aplicația are rute vechi pentru compatibilitate. | Linkurile vechi pot apărea în ghiduri sau bookmarkuri. | Listă oficială de redirecturi și testarea fiecărei rute legacy. | NECONFIRMAT |
| NC-13 | Gardă Setări | Ruta frontend există general, iar controalele detaliate par aplicate în pagină/API. Nu s-a probat fiecare subsecțiune prin acces direct. | Un rol poate vedea un container gol sau o acțiune nepermisă. | UAT direct URL pentru fiecare rol non-admin și fiecare tab Setări. | NECONFIRMAT |
| NC-14 | Task-uri și acces direct | Task-urile sunt suprafață transversală; auditul nu a probat izolarea pe autor, responsabil și departament. | Expunere accidentală între departamente. | Test matrice creator/responsabil/manager/alt departament. | NECONFIRMAT |
| NC-15 | Internaționalizare completă | Profilul de țară există ca direcție, dar România este singurul profil declarat complet. | Nu se poate promite conformitate juridică/fiscală în alte țări. | Checklist per țară pentru fiscal, HR, documente și rapoarte. | PARȚIAL CONFIRMAT |
| NC-16 | Fluxuri end-to-end | Rutele, paginile și testele oferă dovezi, dar nu substituie UAT cu MSSQL și roluri reale. | Un flux documentat poate eșua la integrarea dintre module. | Scenarii UAT din `04-fluxuri-functionale.md`, cu dovezi și rezultat. | NECONFIRMAT |
| NC-17 | Update, restart și rollback | Există mecanisme Windows/Linux și health check, însă comportamentul depinde de serviciu/task/systemd și permisiunile instalării. | Restartul poate necesita intervenție manuală. | Test pe pachetele finale Windows și Linux, inclusiv rollback și port ocupat. | NECONFIRMAT |
| NC-18 | Backup/restore și ștergere Demo | Există backup/restore și ștergere controlată a conturilor Demo, dar completitudinea datelor asociate trebuie demonstrată. | Pierdere sau păstrare nedorită de date. | Set de date martor înainte/după restore și ștergere, verificat pe toate schemele MSSQL. | NECONFIRMAT |

## Regula de închidere

Un element se mută la **CONFIRMAT** numai dacă există simultan: scenariu de test, mediu și versiune notate, rol folosit, rezultat observat și dovadă (captură, export sau log fără secrete).

