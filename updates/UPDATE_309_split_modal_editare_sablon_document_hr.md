# UPDATE 309 — Split modal editare șablon document HR

Versiune: `2.12.289`  
Data: `2026-07-14`

## Scop

Continuă reducerea controlată a fișierului `HRPage.jsx` prin extragerea modalului mare de editare șablon HR într-o componentă React dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRDocumentTemplateModal.jsx`.
- Mutat formularul modalului `Șablon HR — [denumire]` în componenta nouă:
  - denumire, tip și descriere;
  - stare atașament Word;
  - acțiuni descărcare/încărcare/înlocuire Word;
  - inserare variabile;
  - editor vizual `contentEditable`;
  - toolbar Bold, Titlu, Listă, Tabel semnături;
  - mod HTML avansat;
  - acțiunile `Renunță` și `Salvează șablon`.
- `HRPage.jsx` păstrează:
  - state-ul `templateEditing`;
  - state-ul `templateAdvancedMode`;
  - ref-ul `templateEditorRef`;
  - handler-ele editorului vizual;
  - handler-ele Word;
  - submit-ul `saveHrDocumentTemplate`;
  - apelurile API `/hr/document-templates`.

## Compatibilitate

- Nu s-au modificat endpointuri API.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- Comportamentul HTTP, DB și UX rămâne neschimbat.

## Verificare

- Build frontend rulat cu succes: `npm --prefix client run build`.
