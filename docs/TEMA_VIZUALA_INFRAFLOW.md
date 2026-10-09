# Tema vizuală InfraFlow — etapă pilot

Referință: macheta Dashboard din PDF-ul UX Pilot furnizat de utilizator la 6 octombrie 2026.

## Implementat în v2.12.673

1. Paletă verde completă, suprafețe discrete, raze și umbre comune, stări focus/disabled și badge-uri lizibile în tema întunecată.
2. Sidebar cu iconițe Lucide existente, selecție verde și derulare independentă pe desktop. Nu modifică modulele, permisiunile sau rutele.
3. Căutare vizibilă pe ecrane mari, aceeași căutare de pagini/module/file prin Ctrl+K. Nu promite căutare în înregistrări.
4. Taburi existente păstrate; fila activă are accent verde.
5. Dashboard: stil nou pentru indicatorii reali; prioritățile și secțiunile compacte rămân funcționale. Nu introduce grafice sau valori fictive.
6. Oferte CRM: tabel comun, statusuri text/color, filtre etichetate și câmpuri stilizate în formular. Calculele, salvarea, aprobările și facturarea rămân neschimbate.

## Validare și extindere

Etapa v2.12.683: Contabilitate avansată — plan de conturi, solduri, jurnale, balanță, fișă de cont, Cartea Mare, rezultate, situații financiare, centru fiscal, declarații, audit și închidere lună. Tabelele detaliate derulează local, acțiunile se rearanjează pe mobil, iar testul contabil verifică acum atât fluxurile de bază, cât și pe cele avansate fără operațiuni de scriere.

Etapa v2.12.682: Contabilitate de bază — antet și navigare comună pentru Dashboard, terți, facturi, trezorerie și operațiuni contabile; tabele cu derulare locală și formulare/acțiuni responsive. Ghidul contabil și stările semantice sunt lizibile în dark. Test vizual izolat pe desktop/mobil, light/dark, fără salvare sau modificarea calculelor și fluxurilor existente.

Etapa v2.12.681: Task-uri, Tichete, Mesaje și Ajutor — anteturi și taburi comune, tabele cu derulare locală și formulare/acțiuni care se rearanjează pe mobil. Inbox ERP păstrează toate filtrele și acțiunile, iar editorul Ajutor rămâne exclusiv Superadmin. Test vizual izolat pe desktop/mobil, light/dark, fără salvare sau modificarea fluxurilor existente.

Etapa v2.12.680: HR avansat — taburi comune și antet responsive în fișa angajatului; tabele tematizate cu derulare locală în ture, dosare, echipamente, pontaj avansat, tichete masă, evaluări și autorizații. Test vizual izolat pentru fișă, formular concediu/tură, program, echipamente, documente și pontaj avansat. Calculele și documentele printabile rămân neschimbate.

Etapa v2.12.679: antet comun și controale tematizate în HR; lista angajaților și pontajul lunar adoptă tabelul comun cu derulare locală. Coloana angajatului rămâne fixată în pontaj. Test izolat pentru listă, formular Angajat nou și pontaj pe desktop/mobil, light/dark, fără salvare sau validare reală. Panourile HR avansate rămân pentru o etapă separată.

Etapa v2.12.678: Parc & Resurse și Logistică adoptă controale tematizate și tabele cu derulare locală. Antetul parcului este comun; avertismentul privind lipsa transmiterii e-Transport/ANAF rămâne vizibil în dark. Testele izolate verifică listele și formularele Autovehicul nou/Cursă nouă pe desktop și mobil, fără salvare reală.

Etapa v2.12.677: Producție / Operațiuni și Referate adoptă anteturi comune, controale tematizate și tabele cu derulare locală. Ghidul Referate și filtrele au suprafețe lizibile dark. Testul izolat verifică listele, formularele Consum nou/Referat nou și derularea pozițiilor pe mobil, fără consum sau aprobare reală.

Etapa v2.12.676: Stocuri & Depozite și Aprovizionare & Achiziții folosesc anteturi comune, controale tematizate, tabele cu derulare locală și suprafețe informative lizibile în dark. Testul izolat acoperă nomenclatorul, lista comenzilor și formularele Material nou/Comandă nouă pe desktop și mobil, fără salvare sau mișcări de stoc.

Etapa v2.12.675: Contracte și Documente folosesc controale native tematizate în pagină și modal, tabele și anteturi aliniate, indicatori cu accent verde și suprafețe informative adaptate dark. Se păstrează toate filtrele, acțiunile, alertele și secțiunile detaliate; tipărirea nu este modificată. Testul browser include filtrarea Contracte, dosarul contractului și formularele ambelor module, fără salvare.

Corecție v2.12.674: sidebarul desktop rămâne pe toată înălțimea ferestrei după derularea paginii; etichetele lungi nu lărgesc meniul și au numele complet în tooltip. Testul verifică explicit geometria la scroll și lipsa overflow-ului orizontal.

- Test vizual izolat: build frontend, `npm run preview -- --host 127.0.0.1 --port 5175` în client, apoi `node scripts/ui-theme-smoke.cjs` cu Playwright disponibil.
- `INFRAFLOW_PLAYWRIGHT_MODULE` poate indica runtime-ul Playwright existent; nu adaugă dependențe aplicației.
- API-ul este interceptat integral cu date fictive în test; nicio bază de date sau credențială reală nu este folosită.
- Verifică Dashboard, lista/formularul Oferte, filtrele, Ctrl+K, tema întunecată, cele trei densități și mobilul.
- Următoarea etapă: acceptanță vizuală pe PC, apoi adaptare pe module a paginilor legacy și a formularelor/tabelelor care nu folosesc componentele comune. Nu reprezintă o conversie integrală a tuturor modulelor.
- Nu schimba documentele printabile și nu elimina alerte, audit, detalii sau controale pentru a reproduce macheta.
