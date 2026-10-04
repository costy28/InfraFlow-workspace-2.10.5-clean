# UPDATE 668 — Catalog de tarife administrabil (v2.12.648)

## Ce s-a schimbat

- În **Ofertare internă**, Superadmin poate deschide „Tarife standard pachete și extensii”.
- Poate modifica abonamentul lunar, implementarea, numărul de utilizatori incluși, costul utilizatorului suplimentar și costul extensiilor.
- Valorile sunt validate, salvate în configurația organizației și auditate.
- Simulările ulterioare citesc catalogul salvat. Oferta CRM finală își păstrează editarea pe poziție pentru preț, discount și TVA.

## Siguranță

- Doar Superadmin poate vedea sau salva catalogul.
- Cheile pachetelor și extensiilor rămân controlate de aplicație; nu se pot introduce elemente arbitrare prin API.
