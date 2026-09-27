# CRM Sprint 3 — Oferte interne versionate

## Limite asumate

Sprintul 3 acoperă exclusiv oferta internă. Nu pornește Sprintul 4: nu există link public, decizie de client, comandă, stoc, achiziții sau facturare.

## Flux implementat

1. Dintr-un prospect/client CRM se creează o ofertă draft cu cel puțin o poziție.
2. Pozițiile pot fi adăugate, editate, șterse și reordonate numai cât timp oferta este draft.
3. Serverul recalculează subtotalul, discountul, TVA-ul și totalul; browserul afișează doar un calcul orientativ.
4. Draftul se trimite spre aprobare internă.
5. O ofertă aprobată se blochează pentru editare. O modificare ulterioară se face printr-o revizie nouă, cu același grup/numerotare și revizie incrementată.
6. Documentul HTML print-ready este salvat în storage controlat, identificat prin număr + revizie, și este livrat doar prin endpoint autentificat.
7. La trimiterea prin SMTP, documentul se regenerează din revizia aprobată, se atașează mesajului, iar emailul se păstrează în Inbox ERP cu sursa `crm_quote`.

## Test de acceptanță manuală după aplicarea update-ului

1. Activează modulul CRM din Setări → Module; update-ul aplică migrările MSSQL `070`, `071`, `072` la pornire.
2. Creează sau selectează un prospect/client și un contact cu email de test.
3. Creează oferta și trei poziții; modifică o poziție și mută ordinea unei poziții.
4. Salvează draftul și verifică totalurile după reîncărcarea fișei.
5. Trimite spre aprobare, aprobă, apoi confirmă că editorul draft nu mai este disponibil.
6. Generează documentul print-ready și verifică numărul/revizia în antet.
7. Trimite emailul către o adresă de test și verifică mesajul în Mesaje → Inbox ERP, inclusiv sursa CRM.
8. Creează Revizia 2, modific-o și confirmă că Revizia 1 nu s-a schimbat.
9. Verifică auditul din fișa fiecărei revizii.

## Rezultat automat în workspace

- `node --test server/tests/crm-foundation.test.js server/tests/crm-sprint2.test.js server/tests/crm-quotes-sprint3.test.js` — trecut.
- `npm run build` — trecut.

Testul live nu a fost executat înainte de pachet: instanța locală existentă răspunde, dar are CRM dezactivat și schema CRM nemigrată. După aplicarea update-ului, parcurge lista de mai sus pe instanța actualizată.
