# UPDATE 017 — Editor Documente

Data: 2026-06-01
Versiune: 2.11.7

## Descriere

Textarea-ul HTML din formularul `Template nou` a fost înlocuit cu un editor
WYSIWYG Quill.js încărcat din CDN, fără dependență npm nouă.

## Funcționalități

- Toolbar: bold, italic, underline, H1, H2, liste, aliniere și inserare tabel.
- Inserare variabile grupate pe firmă, angajat, document și semnături.
- Variabile afișate ca badge-uri galbene și păstrate ca text `{{variabila}}`.
- Previzualizare în timp real cu date fictive.
- Categorii extinse: Adeverință, Contract, Referat, Notă internă, Proces verbal,
  Decizie, Dispoziție și Altele.
- Motorul documentelor recunoaște aliasurile noi pentru randarea documentelor.

## Fișiere modificate

- `client/index.html`
- `client/src/components/forms/DocumentTemplateEditor.jsx`
- `client/src/index.css`
- `client/src/pages/modules/DocumentePage.jsx`
- `server/modules/documents/engine.js`
- `package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
