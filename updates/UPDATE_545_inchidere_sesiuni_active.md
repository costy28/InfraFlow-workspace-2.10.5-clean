# UPDATE 545 — Închidere sesiuni active din Setări

Versiune: 2.12.525  
Data: 2026-09-01

## Ce s-a schimbat

- Panoul Setări → Sistem → Securitate marchează explicit sesiunea curentă a administratorului.
- Lista de sesiuni active are acțiune de închidere pentru celelalte sesiuni.
- Backend-ul primește endpoint controlat pentru revocarea unei sesiuni după identificator public derivat din hash.
- Tokenul real de sesiune nu este expus nici în diagnostic, nici în interfață.
- Sesiunea curentă nu poate fi închisă accidental din panoul de securitate; pentru contul propriu rămâne acțiunea normală „Ieșire”.
- Închiderea unei sesiuni este înregistrată în audit.

## Impact

- Administratorul poate reacționa rapid dacă vede o stație veche, suspectă sau plecată din firmă.
- Datele sensibile rămân mai bine controlate fără să schimbăm fluxul zilnic de lucru.
- Nu necesită migrare SQL nouă.

## Verificare recomandată

1. Autentifică-te ca administrator.
2. Intră în Setări → Sistem → Securitate.
3. Verifică faptul că sesiunea curentă apare marcată ca „sesiunea ta”.
4. Autentifică un al doilea browser/dispozitiv și închide acea sesiune din panou.
5. Confirmă că al doilea browser trebuie să se autentifice din nou.
