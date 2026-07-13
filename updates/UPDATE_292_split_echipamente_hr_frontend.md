# UPDATE 292 — Split echipamente HR frontend

Versiune: `2.12.272`
Data: `2026-07-13`

## Scop

Continuă curățarea incrementală a `HRPage.jsx` prin extragerea tabului `🦺 Echipamente` într-o componentă dedicată, fără modificări de comportament.

## Modificări

- A fost adăugat `client/src/pages/modules/hr/HREquipmentPanel.jsx`.
- Taburile interne `Necesar per Departament`, `Expirări`, `Comandă Furnizor` și `📚 Catalog` sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, încărcarea datelor, verificările de permisiuni și handler-ele existente.
- Componenta primește datele și callback-urile prin props, în același model folosit de panourile HR extrase anterior.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- Schema DB rămâne neschimbată.
- Nu s-au adăugat dependențe noi.
- UX-ul și textele afișate rămân aceleași.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
