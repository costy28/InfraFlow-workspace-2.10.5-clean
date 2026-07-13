# UPDATE 294 — Split modaluri echipamente HR

Versiune: `2.12.274`
Data: `2026-07-13`

## Scop

Continuă curățarea incrementală a `HRPage.jsx` prin extragerea celor două modaluri dense din zona de echipamente HR.

## Modificări

- A fost adăugat `client/src/pages/modules/hr/HREquipmentCatalogModal.jsx`.
- A fost adăugat `client/src/pages/modules/hr/HREquipmentDotareModal.jsx`.
- Modalul de catalog păstrează câmpurile existente pentru denumire, categorie, mărimi, serie, expirare, valoare, cod articol, furnizor și activ.
- Modalul de dotare păstrează câmpurile existente pentru obiect, mărime, număr serie, valoare, dată, cantitate și observații.
- `HRPage.jsx` păstrează state-ul, încărcarea datelor și handler-ele de salvare.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- Schema DB rămâne neschimbată.
- Nu s-au adăugat dependențe noi.
- UX-ul și textele afișate rămân aceleași.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
