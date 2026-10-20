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

## Legături Email pe țintă — v2.12.728

Propunerile și operațiile folosesc politica modulelor Contracte, Documente și Task-uri. Funcțiile de acces sunt reutilizate, nu înlocuite cu drepturi noi. În MSSQL, documentele sunt citite relațional împreună cu pașii/partajările pentru filtrarea accesului. Colecțiile sunt cerute numai pentru tipurile relevante, iar Inbox fără legături nu încarcă ținte.

Crearea refuză ID-uri arbitrare/inaccesibile și folosește label/URL canonic. Răspunsurile filtrează legăturile existente și normalizează aliasurile numerice Documente. Citirea pe țintă și anularea nu pot ocoli autorizarea. Legăturile ascunse/orfane sunt păstrate în stocare pentru audit; curățarea lor nu este automată.

44 teste și 22 scenarii HTTP/recitire au trecut: acces pe trei tipuri, refuz ținte străine/inexistente, metadate canonice, rezolvare după limita de 80, ID/UUID, anulare permisă/refuzată și revocare în sesiunea deja deschisă. Executorul SQL pentru propuneri este simulat; nu s-a testat integrarea SQL live. Rămân metadatele istorice `source_*`, descărcările/atașamentele și verificarea integrată pe SQL a fluxurilor modificate. Nu se declară auditul integral finalizat.

## Surse și atașamente Email — v2.12.729

Metadatele `source_*` sunt rezolvate în contextul autorizat, inclusiv în răspunsurile de creare/modificare/sincronizare. Sursele arbitrare sau indisponibile sunt ascunse; corpul emailului rămâne intact. Sursele CRM sunt verificate relațional și cer drept dedicat, cu cache doar pe cererea curentă; comanda CRM nu primește un URL UI presupus. Sursele comune folosesc politica de acces existentă.

Atașamentele Inbox rămân copii consultabile cu `messaging:view`; nu se introduc permisiuni noi sau acces la fișiere originale. Lista și descărcarea folosesc aceleași indexuri normalizate. Indexuri invalide și emailuri anulate sunt refuzate; numele Unicode, antetele și MIME sunt tratate controlat, fără cache și cu nosniff.

47 teste și 24 scenarii HTTP/recitire trecute, inclusiv descărcare reală de octeți din baza JSON temporară. CRM/SQL testate prin executor simulat, nu integrare SQL live. Urmează verificarea integrată SQL Server a fluxurilor Documente/Mesaje modificate și consolidarea matricei finale de roluri; nu se declară întregul ERP auditat.

## Verificare SQL Documente — v2.12.730, 18 octombrie 2026

Testul izolat a trecut cu 19 cereri HTTP și 35 interogări SQL reale. A identificat și permis corectarea conversiei departamentului gol în UUID. Aprobarea persistă starea și auditul; expirarea partajării revocă accesul și metadatele Email. Autentificarea și starea generală sunt simulate, nu instalația completă. Regresie: 48 teste unitare/policy și 24 scenarii JSON trecute. Matrice consolidată și limite: `MATRICE_ROLURI_DOCUMENTE_MESAJE_2026-10-18.md`. Nu se declară întregul ERP auditat.

## Login și surse CRM SQL — v2.12.731, 18 octombrie 2026

9 cereri HTTP / 35 interogări SQL trecute: login și audit reale, Bearer, refuz fără token/parolă greșită, acces Documente, surse CRM reale, ID lipsă/lead anulat, revocare drepturi și cont dezactivat. Descoperită și corectată eticheta comenzii care prelua numărul ofertei asociate. 49 teste unitare/policy și 24 scenarii JSON trecute; build și audit expuneri OK. Adaptor app-state de test pe SQL, nu pornire completă app.js/core/db; limitele sunt explicate în matrice. Nicio instalație repornită, fără integrare externă apelată.

## Acceptanță app.js complet pe MSSQL standard — 18 octombrie 2026

Test nou opt-in `full-app-mssql-http.test.js`: 18 cereri HTTP, două porniri reale, auth/core-db/API roluri și utilizatori neînlocuite. Drepturile retrase se aplică în sesiunea existentă; dezactivarea, urmărirea și auditul persistă în SQL și sunt confirmate după restartul procesului de test. Bază păstrată: `INFRAFLOW_TEST_DOCS_E5A0EA708F76`. Regresie rerulată: 49 teste/policy, audit expuneri zero constatări.

Configurație standard app-state, flag relațional extins oprit. Executorul Windows PowerShell funcțional; pool-ul Node nu s-a autentificat cu Windows Integrated Security și rămâne nevalidat. Prima încercare a expus limita bufferului și curățarea procesului în infrastructura testului, ambele corectate înaintea reluării integrale reușite. Fără modificări noi de runtime sau versiune; nu este necesară instalarea unui update suplimentar. Matricea conține comenzile, jurnalul și limitele. Nu se declară întregul ERP auditat.

## Diagnostic relațional — v2.12.732, 18 octombrie 2026

Driver implicit Tedious: autentificarea Windows Trusted Connection nu este suportată; parserul instalat ignoră Integrated Security. Două teste de contract și documentația oficială confirmă cauza; fără dependență nativă nouă sau schimbarea autentificării. SQL-login live și transportul pooled rămân de verificat separat.

Auditul real al schemei a identificat eroarea de compilare a coloanei generated la 063. Migrarea pregătitoare nouă 062b remediază problema fără rescrierea istoricului. Test SQL trecut cu reproducere, aplicări repetate și trei documente păstrate; 52 teste fără SQL trecute, un test SQL sărit explicit, iar rularea opt-in dedicată are două teste trecute. Build/audit expuneri/release check fără ZIP reușite.

Reluarea a trecut 73 fișiere și a ajuns la eroarea separată 066 cancelled_at/cancelled_reason. Aceasta rămâne următorul pas, cu verificarea efectelor asupra centrelor și asocierilor. Lipsește și fișierul general de import app-state → relațional. Schema extinsă nu este declarată finalizată și nu a fost activată pe instalații. Matricea detaliază bazele sintetice și limitele.

## Preflight Controlling — v2.12.733, 18 octombrie 2026

Migrare 065b înainte de 066: coloane pregătite separat și gardă pentru coduri istorice personalizate sau cu referințe operaționale. Cazurile ambigue cer verificare manuală, fără forțarea curățării. Migrarea istorică nu este editată; dacă este deja înregistrată ca aplicată, garda nu blochează retroactiv upgrade-ul.

SQL real trecut (`INFRAFLOW_TEST_DOCS_7EB4BD34A9F1`): reproducere, coliziune ADMINISTRATIV, asociere/buget/vehicul, idempotentă și istoric. 18 centre și datele clientului păstrate. 53 teste fără SQL trecute, două sărite explicit; testul SQL dedicat are două teste trecute. Build și audit expuneri OK. Limite: nu pornește întreaga aplicație, nu validează toate schemele personalizate, nu livrează sincronizarea generală app-state și nu activează modul relațional pe instalații.

Diagnosticul integral de schemă a trecut 76 fișiere în `INFRAFLOW_TEST_DOCS_41D829A28C3C`, inclusiv 066/067. Următorul blocaj este 068, indexul filtrat pentru task-uri contractuale, cu eroare SQL lângă NOT. Nu este inclus în remedierea curentă; celelalte fișiere și sincronizarea generală rămân de verificat. Nu se declară schema integral validată.

## Index contractual — v2.12.734, 18 octombrie 2026

Corecție strictă de sintaxă în 068: NOT IN devine comparații <> echivalente. Migrarea nouă 078 recuperează un index lipsă, dar refuză duplicatele fără modificarea task-urilor. Nu reconstruiește indexuri customizate și nu schimbă regula NULL.

SQL real trecut (`INFRAFLOW_TEST_DOCS_E02177937DEB`): reproducere istorică, index activ, duplicate refuzate, stări finale/anulare, reluare și recuperare fără ștergeri. Două teste SQL dedicate trecute; regresie fără opt-in 54 trecute, trei sărite explicit. Build/audit expuneri/diff check OK. Nu sunt validate toate configurațiile istorice, UI-ul, sincronizarea generală sau transporturile SQL rămase; modul extins nu este activat pe instalații.

Diagnosticul complet de schemă a trecut toate cele 87 fișiere în `INFRAFLOW_TEST_DOCS_8777F38B9E9D`, fără eroare. Este validare DDL pe bază goală, nu bootstrap complet sau migrare de date existente. Lipsește în continuare fișierul general de import app-state. Urmează sincronizare controlată și reconciliere pe date sintetice; nu se activează automat modul extins și nu se declară auditul ERP integral finalizat.

## Preflight sincronizare Core — 18 octombrie 2026

Etapă internă fără modificare de versiune (2.12.734): analizor pur și CLI offline pentru utilizatori/departamente. Nu generează ID-uri/roluri, nu execută SQL, nu scrie și nu autorizează importul. Rezultatul cere verificare inclusiv în lipsa blocajelor detectate. Detectează diferențele dintre ID text/UUID, roluri multiple/singular, societate, referințe, aliasuri și credențiale legacy; nu publică date personale sau secrete.

10 teste dedicate și set agregat de 64 teste trecute; trei teste SQL anterioare sărite explicit. Test SQL separat trecut în `INFRAFLOW_TEST_DOCS_EB285D5B040C`: comparație pe scheme reale și date sintetice, fără modificarea snapshot-ului sau app-state. Audit expuneri zero. Document de lucru: `PLAN_SINCRONIZARE_CORE_2026-10-18.md`. Urmează manifest de mapare explicită și validarea lui, nu activarea importului. Nu sunt validate transporturile și celelalte module; instalațiile/pachetele nu au fost modificate.
