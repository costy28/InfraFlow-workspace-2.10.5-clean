# UPDATE 313 — Split zona Documente HR frontend

Versiune: `2.12.293`  
Data: `2026-07-14`

## Scop

Reducerea dimensiunii și complexității din `HRPage.jsx` prin extragerea tabului principal `Documente HR` într-o componentă dedicată, fără modificări de comportament.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRDocumentsPanel.jsx`.
- Mutat în componentă dedicată:
  - cardul de introducere și export raport dosar HR;
  - dashboard-ul de conformitate dosar HR;
  - filtrele de dashboard dosar;
  - lista de șabloane HR și acțiunile Word;
  - checklistul dosarului personal;
  - cardurile cu documente rapide pe angajat.
- `HRPage.jsx` rămâne responsabil pentru:
  - state;
  - handler-e;
  - funcțiile de print;
  - apelurile API deja existente;
  - permisiuni.

## Compatibilitate

- Nu au fost schimbate endpointuri API.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- UX-ul și textele existente au fost păstrate.

## Verificare

- `npm --prefix client run build` — OK.
