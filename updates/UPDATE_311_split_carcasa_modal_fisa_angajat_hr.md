# UPDATE 311 — Split carcasă modal fișă angajat HR

Versiune: `2.12.291`  
Data: `2026-07-14`

## Scop

Continuă reducerea controlată a fișierului `HRPage.jsx` prin extragerea carcasei modalului de fișă angajat într-o componentă React dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeeProfileModal.jsx`.
- Mutat în componenta nouă structura comună a modalului `Fișa — [angajat]`:
  - deschiderea/închiderea modalului;
  - titlul și starea de încărcare;
  - headerul profilului;
  - cardurile de status;
  - activitatea recentă;
  - taburile profilului;
  - zona `children` pentru conținutul tabului activ.
- `HRPage.jsx` păstrează:
  - conținutul taburilor;
  - state-ul profilului;
  - handler-ele de editare, print, poză, activitate și taburi;
  - apelurile API deja existente.

## Compatibilitate

- Nu s-au modificat endpointuri API.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- Comportamentul HTTP, DB și UX rămâne neschimbat.

## Verificare

- Build frontend rulat cu succes: `npm --prefix client run build`.
