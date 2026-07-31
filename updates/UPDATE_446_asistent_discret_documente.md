# UPDATE 446 — Asistent discret Documente

Versiune: `2.12.426`  
Data: 2026-07-31

## Scop

Continuă transformarea modulelor mari în fluxuri ghidate: Documente nu trebuie să fie doar o listă de fișiere și circuite, ci să arate rapid ce are utilizatorul de făcut.

## Modificări

- `client/src/pages/modules/DocumentePage.jsx`
  - înlocuit ghidul generic `ContextHelp` cu un asistent operațional compact;
  - adăugat sumar pentru:
    - Inbox documente;
    - documente urgente;
    - drafturi de finalizat;
    - documente provenite din email;
    - template-uri disponibile;
  - asistentul ține cont și de documentul selectat:
    - pas curent de aprobare;
    - pași în așteptare în circuit;
    - task-uri deschise legate de document;
    - emailuri/atașamente sursă deja afișate în dosar;
  - indicatorii rapizi deschid tabul relevant sau primul document util;
  - detaliile operaționale sunt pliabile.

## Compatibilitate

- Nu modifică API-uri.
- Nu modifică schema DB.
- Nu schimbă fluxurile existente de aprobare, task sau email.
- Funcționează cu datele deja încărcate în `DocumentePage.jsx`.

## Observație audit

`DocumentePage.jsx` rămâne un fișier mare și ar trebui împărțit ulterior în subcomponente:

- listă documente;
- detalii document;
- template-uri;
- modal document nou/editare;
- legături email/task;
- asistent documente.

## Verificări

- `npm run build` ✅
- `npm run release:check` ✅
- ZIP update generat: `installer/output/InfraFlow-update-v2.12.426.zip` ✅
