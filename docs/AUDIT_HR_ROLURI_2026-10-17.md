# Verificarea HR pe roluri — 17 octombrie 2026

## Domeniu și metodă

Punct de plecare: sursă v2.12.718. Verificarea completează corecțiile granulare HR și protecțiile pontajului din v2.12.707–718.

- Suita `server/tests/hr-*.test.js`: 175 teste trecute, un test MSSQL real omis în rularea standard.
- `npm run test:hr:roles`: server Express real, autentificare cu parole temporare, sesiuni și verificări prin HTTP. Cinci profiluri cu permisiuni explicite; șase scenarii legate între ele.
- Simularea HTTP folosește exclusiv un fișier JSON temporar și ascultă pe loopback. Schedulerul este dezactivat. Nu utilizează instalația activă, SMTP sau Oblio.
- Testele de rută cu executor SQL controlat și testarea pe SQL Server real sunt categorii distincte.

## Rezultate confirmate în această sesiune

- Suita HR standard: **175 trecute, 0 eșuate**, testul relațional fiind omis doar în acea rulare standard.
- Simulare HTTP: **6/6 scenarii trecute**, cu cinci profiluri autentificate.
- Regresii centrale de permisiuni: **18/18 trecute**.
- Integrare SQL Server reală, activată separat: **1/1 test trecut, 0 omise**, durată aproximativ 333 secunde.
- Bază SQL sintetică păstrată pentru diagnostic: `INFRAFLOW_TEST_HR_7B69A1477C70`.
- Mesajele SQL de trunchiere a seriei certificatului și de angajat inexistent provin din cazuri negative intenționate, confirmate prin aserțiuni.
- Build React/Vite și audit de expunere fișiere: trecute; auditul a raportat 0 constatări.

Integrarea SQL reală existentă verifică operații HR relaționale, Kiosk, citirea și filtrarea datelor, notificări, transferuri, registru, formare și evaluări. Nu trebuie interpretată ca testarea prin SQL real a fiecărei rute HR sau a fiecărei corecții recente. Pentru acestea, matricea HTTP JSON și testele de rută sunt dovezi separate.

## Matricea simulării HTTP

| Profil | Operații verificate | Rezultat așteptat |
|---|---|---|
| Angajat | Foaie lunară proprie, schimbare ID către coleg, compensare deghizată în sold inițial, ore negative | Numai date proprii; modificarea colegului și compensările invalide refuzate |
| Șef departament | Colegi din departament, aprobare ore proprii, aprobare în alt departament, validare fără drept dedicat | Acces departamental; fără validare implicită sau aprobare străină |
| Validator departament | Lot mixt de angajați, lot autorizat, închidere globală | Lotul mixt refuzat integral; validare autorizată permisă; închiderea globală refuzată |
| HR global | Închidere/redeschidere lună; scriere încercată de angajat în luna închisă | Închidere controlată, scriere blocată, redeschidere cu motiv |
| HR global și angajat | Aprobare concediu repetată, sold CO înainte/după repetare, inversare în respins | Sold neschimbat la repetare; inversarea refuzată |
| Superadmin | Starea lunii și dreptul efectiv de administrare | `can_manage=true` |

## Acoperirea suplimentară a suitelor HR

Testele existente verifică navigarea pe subfuncții, datele personale/salariale/medicale, descărcarea documentelor proprii și ale colegilor, protecția storage, administrarea angajaților și contractelor, ture, tichete, formare, evaluări, notificări, Kiosk, pontaje validate și decizii repetate.

Aceste verificări nu echivalează cu o inspecție vizuală a fiecărui ecran și nici cu auditarea completă a tuturor rutelor HR sau a salarizării.

## Comenzi de repetare

```powershell
$tests = Get-ChildItem server/tests -Filter 'hr-*.test.js' | ForEach-Object FullName
node --test @tests
npm run test:hr:roles
```

SQL Server real, schemă sintetică izolată pe instanța locală `SQLEXPRESS`:

```powershell
$env:INFRAFLOW_TEST_HR_SQL = '1'
try {
  node --test --test-name-pattern 'rutele HR relaționale' server/tests/hr-route-access.test.js
} finally {
  Remove-Item Env:INFRAFLOW_TEST_HR_SQL -ErrorAction SilentlyContinue
}
```

Testul SQL creează o bază `INFRAFLOW_TEST_HR_<identificator>` și o păstrează pentru diagnostic. Autentificarea și starea generală a aplicației sunt simulate în acel test; interogările sunt executate pe SQL Server real. Simularea HTTP verifică separat integrarea autentificării și rutelor, cu provider JSON.

## Ce rămâne de verificat

1. Completarea inspecției vizuale în Desktop, pe mobil și după schimbarea permisiunilor/reautentificare. Chrome desktop cu API simulate este verificat mai jos.
2. Fluxuri pe o instalație completă MSSQL, inclusiv reconcilierea salarizării/costurilor după devalidare; schema SQL sintetică nu reproduce întreaga instalație.
3. Instalarea pachetelor pe PC și Linux, repornirea și verificarea post-update.
4. Auditul celorlalte module după inventarul de rute și permisiuni.
5. Traseul comercial Oblio, disponibil din nou, după etapa curentă conform priorității utilizatorului.

## Completare vizuală — v2.12.720

Verificarea în Chrome desktop (1440 × 1000) a trecut pentru patru profiluri: angajat cu pontaj propriu, vizualizare HR, citire pontaj și rol `admin` cu numai pontaj propriu. API-urile sunt simulate, iar aplicația randată este buildul curent din `client/dist`.

S-a corectat scurtătura de rol `admin` din HRPage, care acorda în interfață acces automat la toate funcțiile HR. Taburile și acțiunile folosesc acum aceeași funcție de permisiuni; numai superadmin păstrează excepția globală.

Sunt verificate: taburi administrative și buton de validare absente fără drept, celulă validată dezactivată și zi nevalidată editabilă. Captura profilului admin restrâns a fost inspectată vizual. Meniul general poate păstra scurtături de rol în afara HR; acestea rămân în inventarul auditului și nu sunt declarate rezolvate aici.

Comandă în checkout-ul sursă după `npm run build`:

```powershell
# Dacă Playwright nu este instalat local, indică modulul disponibil în mediul de test.
$env:INFRAFLOW_PLAYWRIGHT_MODULE = 'cale-absoluta-catre-modulul-playwright'
node scripts/verify-permissions-ui.cjs
```

## Completare navigare comună — v2.12.721

Filtrul comun și meniul modulelor nu mai acordă automat acces pe baza rolului admin. Căutarea filtrează inclusiv filele recente cunoscute după drepturile curente și reface lista la deschidere. Paginile administrative marcate explicit păstrează verificările lor de rol.

Chrome: pentru toate cele patru profiluri restrictive, inclusiv admin, CRM lipsește din meniu/căutare, fila CRM recentă nu este sugerată, fila HR permisă rămâne vizibilă și URL-ul direct CRM afișează acces restricționat fără cereri API CRM. Captura meniului admin restrâns a fost inspectată vizual.

Această verificare nu declară rezolvate scurtăturile interne din Documente, Mesaje sau alte pagini; ele rămân de confruntat cu autorizarea serverului.

## Completare Documente și Mesaje — v2.12.722

Au fost înlocuite scurtăturile locale de autorizare din rutele Documente, Mesaje și WhatsApp cu verificarea centrală. Simularea HTTP are acum opt profiluri și nouă scenarii, inclusiv admin restrâns (refuz șabloane/canale/WhatsApp), editor șabloane și gestionar canale fără rol admin (succes cu drept explicit).

Chrome cu API simulate confirmă afișarea condiționată a butoanelor administrative și lipsa formularului de trimitere fără `messaging:send`. Controlul pe fiecare tab și fiecare operație rămasă în cele două module continuă separat.

## Completare interfață Documente — v2.12.723

Taburile de consultare folosesc dreptul cerut de API (`documents:view_own`), iar Template-uri cere `documents:templates`. Pentru editorul exclusiv de șabloane, pagina pornește direct în Template-uri, fără asistentul de documente. Crearea și editarea draftului propriu cer `documents:create`.

Verificări: 23 teste de permisiuni, nouă scenarii HTTP reale într-o bază JSON temporară, build și audit expunere fișiere (zero constatări). Chrome verifică patru profiluri HR/navigare plus trei profiluri Documente/Mesaje: cititor admin restrâns, editor delegat de șabloane și creator de documente; API simulate. Captura editorului de șabloane a fost inspectată vizual. Nu s-a instalat sau repornit aplicația utilizatorului.

Rămân auditul celorlalte acțiuni din dosarul documentului și secțiunile Email/WhatsApp. Nu s-a modificat schema MSSQL în această etapă.

## Acces pe document și decizie — v2.12.724

Dosarul relațional, PDF-ul, istoricul și partajarea verifică accesul pe entitate. Evaluatorul acceptă contextul MSSQL explicit și respinge partajări expirate sau fără destinatar. Retragerea cere drept de creare. Interfața cere drept de aprobare și primul pas în așteptare atribuit utilizatorului; Inbox nu este oferit unui simplu cititor.

12 scenarii HTTP reale în JSON temporar și 27 teste au trecut, inclusiv refuz cititor atribuit, refuz document străin și succes responsabil autorizat. Chrome cu API simulate verifică decizia pentru cititor și aprobator. MSSQL: evaluatorul este testat cu context relațional simulat, fără integrare SQL live în această etapă.

Constatare separată: normalizarea legacy `normalizeRolePermissionOverrides` din `server/core/db.js` folosește un catalog vechi care elimină drepturi Documente/Mesaje din override-ul admin al fixture-ului. Refuzurile admin din scenariile anterioare rămân valide, dar nu probează păstrarea dreptului său de citire. Scenariile pozitive curente folosesc roluri personalizate explicite. Normalizarea trebuie unificată și retestată în etapa următoare. Acțiunile Task/Email și celelalte rute Documente rămân în audit.

## Persistența drepturilor standard — v2.12.725

Normalizarea override-urilor a fost centralizată: cele zece copii din DB, setup și module delegă funcției exportate din `core/permissions.js`. Nu mai folosesc cataloage locale depășite. Rolurile din prototip sunt excluse explicit. Nu se restaurează automat drepturi deja pierdute și nu se modifică drepturile acordate de client.

39 teste trecute: catalogul complet, liste goale, eliminarea valorilor necunoscute, idempotentă și delegarea tuturor adaptoarelor, plus regresiile de autorizare. 13 scenarii HTTP/recitire în JSON temporar trecute: adminul restrâns citește documentul partajat și canalele, dar nu poate administra șabloane/canale/WhatsApp. După toate scrierile HTTP, override-ul este verificat pe disc și prin `readDb` într-un proces Node nou. Build, audit expuneri (zero constatări) și verificarea metadatelor release au trecut. Nu s-a făcut integrare SQL live sau instalare în aplicațiile utilizatorului.

Urmează acțiunile Task/Email din Documente și rutele Documente rămase (inclusiv urmărire și lista partajate), apoi secțiunile Email/WhatsApp. Codul legacy din afara normalizării override-urilor nu este declarat eliminat de această etapă.

## Urmărire, partajare și legături în dosar — v2.12.726

Lista partajatelor JSON exclude expirările; SQL evită dublurile prin EXISTS. Urmărirea MSSQL verifică documentul și accesul înainte de scriere. Lista urmăritelor SQL recunoaște circuitul și partajările active. HTTP în JSON confirmă că partajarea expirată și simpla înscriere în watchers nu conferă acces, un document nu apare de două ori și urmărirea/dezurmărirea unui document accesibil funcționează.

Dosarul nu cere `/messaging/email/links` și nu oferă deschiderea sursei email fără `messaging:view`. Chrome cu API simulate verifică profilul fără mesagerie și refuzul URL-ului direct Mesaje. Task-urile păstrează politica proprie: scenariul HTTP confirmă creare proprie și refuzul delegării neautorizate. 39 teste și 16 scenarii HTTP/recitire trecute; fără integrare SQL live. Urmează API-urile Email/WhatsApp și accesul la țintele legăturilor. Notificările istorice și celelalte fluxuri nu sunt declarate auditate integral.

## Consultare versus modificare mesagerie — v2.12.727

Controalele și handler-ele pentru compunere, draft, sincronizare, status și legături Email respectă `messaging:send`. Consultarea unui mesaj nu produce PATCH pentru cititor. Document din email cere `documents:create`; legarea auxiliară și marcarea Email nu se încearcă fără drept de trimitere. Statusul WhatsApp cere acum același drept de modificare ca Email.

43 teste și 18 scenarii HTTP/recitire trecute. HTTP real în JSON temporar confirmă consultare permisă, refuzul modificării pentru cititor și succesul expeditorului la status/draft. Chrome cu API simulate verifică butoanele inactive/active și lipsa scrierilor Email la deschiderea de către cititor. Fără SMTP/Meta, integrare SQL live sau instalare pe PC/server. Rămâne accesul la entitățile propuse și existente în legăturile Email.
