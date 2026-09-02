# UPDATE 546 — Expirare controlată pentru sesiuni

Versiune: 2.12.526  
Data: 2026-09-02

## Ce s-a schimbat

- Autentificarea verifică centralizat vârsta sesiunii la fiecare request.
- Sesiunile expiră după inactivitate sau după durata maximă configurată.
- Setări → Sistem → Securitate include formular pentru:
  - expirare după inactivitate, în minute;
  - durata maximă a sesiunii, în ore.
- Diagnosticul de securitate afișează politica activă.
- Valorile sunt limitate pentru utilizare sigură:
  - 15-1440 minute pentru inactivitate;
  - 1-168 ore pentru durata maximă.

## Impact

- Dacă un utilizator uită aplicația deschisă, sesiunea nu rămâne activă la nesfârșit.
- Administratorul poate ajusta politica în funcție de organizație.
- Datele sensibile sunt protejate mai bine fără să schimbăm modul normal de lucru.

## Verificare recomandată

1. Intră în Setări → Sistem → Securitate.
2. Verifică valorile politicii de sesiuni.
3. Salvează o valoare de test.
4. Apasă „Reverifică” și confirmă că diagnosticul afișează politica actualizată.

Nu necesită migrare SQL nouă.
