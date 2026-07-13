# UPDATE 293 — Split echipamente din fișa angajat HR

Versiune: `2.12.273`
Data: `2026-07-13`

## Scop

Continuă decompoziția sigură a `HRPage.jsx` prin extragerea secțiunii de echipamente și inventar din fișa angajatului într-o componentă dedicată.

## Modificări

- A fost adăugat `client/src/pages/modules/hr/HREmployeeEquipmentSection.jsx`.
- Secțiunea `Echipamente și inventar în răspundere` din profilul angajatului este randată din componenta dedicată.
- Mărimile pe tip de obiect, inventarul pe categorii, bifarea de predare la lichidare și totalul valoric rămân afișate identic.
- `HRPage.jsx` păstrează state-ul, modalul de dotare, încărcarea datelor și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- Schema DB rămâne neschimbată.
- Nu s-au adăugat dependențe noi.
- UX-ul și textele afișate rămân aceleași.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
