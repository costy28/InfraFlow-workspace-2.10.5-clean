# UPDATE 099 - Hotfix mobil Documente

Versiune: 2.12.79
Data: 2026-06-21

## Problema

Pe mobil, tabelul din pagina Documente era prea lat. Coloana cu actiuni pentru documente si template-uri iesea din ecran, deci nu se vedeau butoanele de adaugare/editare/detalii.

## Rezolvare

- Listele de documente si template-uri sunt afisate ca layout de carduri pe ecrane mici.
- Actiunile principale sunt vizibile sub fiecare card.
- Butonul `+ Document nou` este disponibil si cand utilizatorul se afla in tabul Template-uri.
- Butonul `+ Template nou` este full-width pe mobil.

## Verificare

- `npm run build` in client.
- `npm run check` in server.
