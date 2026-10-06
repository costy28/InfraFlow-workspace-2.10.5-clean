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

Etapa v2.12.676: Stocuri & Depozite și Aprovizionare & Achiziții folosesc anteturi comune, controale tematizate, tabele cu derulare locală și suprafețe informative lizibile în dark. Testul izolat acoperă nomenclatorul, lista comenzilor și formularele Material nou/Comandă nouă pe desktop și mobil, fără salvare sau mișcări de stoc.

Etapa v2.12.675: Contracte și Documente folosesc controale native tematizate în pagină și modal, tabele și anteturi aliniate, indicatori cu accent verde și suprafețe informative adaptate dark. Se păstrează toate filtrele, acțiunile, alertele și secțiunile detaliate; tipărirea nu este modificată. Testul browser include filtrarea Contracte, dosarul contractului și formularele ambelor module, fără salvare.

Corecție v2.12.674: sidebarul desktop rămâne pe toată înălțimea ferestrei după derularea paginii; etichetele lungi nu lărgesc meniul și au numele complet în tooltip. Testul verifică explicit geometria la scroll și lipsa overflow-ului orizontal.

- Test vizual izolat: build frontend, `npm run preview -- --host 127.0.0.1 --port 5175` în client, apoi `node scripts/ui-theme-smoke.cjs` cu Playwright disponibil.
- `INFRAFLOW_PLAYWRIGHT_MODULE` poate indica runtime-ul Playwright existent; nu adaugă dependențe aplicației.
- API-ul este interceptat integral cu date fictive în test; nicio bază de date sau credențială reală nu este folosită.
- Verifică Dashboard, lista/formularul Oferte, filtrele, Ctrl+K, tema întunecată, cele trei densități și mobilul.
- Următoarea etapă: acceptanță vizuală pe PC, apoi adaptare pe module a paginilor legacy și a formularelor/tabelelor care nu folosesc componentele comune. Nu reprezintă o conversie integrală a tuturor modulelor.
- Nu schimba documentele printabile și nu elimina alerte, audit, detalii sau controale pentru a reproduce macheta.
