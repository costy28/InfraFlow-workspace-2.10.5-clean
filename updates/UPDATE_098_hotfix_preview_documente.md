# UPDATE 098 - Hotfix preview documente

Versiune: 2.12.78
Data: 2026-06-21

## Problema

Preview-ul documentului era incarcat direct in `iframe` prin URL-ul `/api/documents/:uuid/pdf`.
Ruta API cere autentificare, iar iframe-ul nu trimitea header-ul `Authorization`, deci era afisat raspunsul:

```json
{"error":"Autentificare necesara."}
```

## Rezolvare

- Pagina Documente incarca HTML-ul documentului prin `api.get`, cu tokenul curent.
- Iframe-ul afiseaza documentul prin `srcDoc`.
- Butonul `Deschide documentul` creeaza un Blob HTML local din raspunsul autentificat.

## Verificare

- `npm run build` in client.
- `npm run check` in server.
