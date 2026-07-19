# UPDATE 351 — Act adițional cu fișier atașat

Versiune: `2.12.331`  
Data: `2026-07-19`

## Ce s-a schimbat

- Formularul de act adițional din dosarul contractului acceptă fișier semnat opțional.
- Fișierul se salvează în același depozit de atașamente al contractului și primește legătură directă cu actul adițional.
- Istoricul actelor adiționale afișează badge „fișier atașat” și buton de descărcare.
- Fișa printabilă a contractului include coloana „Fișier” în tabelul actelor adiționale.
- Upload-ul general de atașamente contract folosește aceeași funcție internă ca upload-ul din act adițional.

## Compatibilitate

- Nu necesită migrare DB nouă; structura existentă avea deja `atasament_id` pe actul adițional.
- Atașamentele existente rămân compatibile.
- Se păstrează ruta existentă de creare act adițional, dar acceptă și `multipart/form-data`.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm --prefix client run build`
