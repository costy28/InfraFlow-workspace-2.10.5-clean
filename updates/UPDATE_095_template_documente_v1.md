# UPDATE 095 - Template Documente v1

Versiune: 2.12.75
Data: 2026-06-21

## Ce s-a schimbat

- Modulul Documente permite atasarea unui model client la fiecare template.
- Sunt acceptate fisiere DOCX, XML, HTML si HTM, salvate in `storage/document-templates`.
- A fost adaugat tabelul `documents.document_template_files` pentru istoricul modelelor incarcate.
- `documents.document_types` primeste metadate pentru tip document, format, descriere si fisier model curent.
- Generatorul HTML intelege variabile noi, inclusiv `{{societate.nume}}`, `{{document.numar}}`, `{{furnizor.denumire}}`, `{{client.denumire}}`, `{{factura.total}}`, `{{utilaj.cod}}` si `{{sofer.nume}}`.
- Pagina Documente afiseaza modelul atasat, permite download si preview server-side.

## Verificare

- `npm run build` in client.
- `npm run check` in server.
