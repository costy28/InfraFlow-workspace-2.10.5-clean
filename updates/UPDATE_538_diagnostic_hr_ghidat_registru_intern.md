# UPDATE 538 — Diagnostic HR ghidat registru intern

Versiune: 2.12.518  
Data: 2026-08-29

## Obiectiv

Diagnosticul registrului intern HR trebuie să fie mai ușor de folosit: operatorul să vadă imediat unde se rezolvă fiecare lipsă, fără să deducă manual dacă problema ține de date personale, contracte sau setările companiei.

## Implementare

- Am îmbogățit diagnosticul registrului intern cu:
  - `issue_details`, lista câmpurilor lipsă/atenționărilor cu zona de lucru;
  - `target_area`, zona principală de rezolvare;
  - `target_tab`, tabul către care trebuie dus operatorul;
  - `action_label`, acțiunea recomandată.
- Dashboard HR afișează pentru fiecare rând:
  - zona de rezolvare;
  - acțiunea recomandată;
  - badge-uri pe câmpurile problemă.
- Butonul `Rezolvă` folosește acum ținta calculată de diagnostic, nu mai deduce zona după text.
- Exportul Excel al diagnosticului include zona de rezolvare și detaliile ghidate.

## Verificări

- Test pentru câmpurile ghidate din diagnosticul registrului intern.
- Test pentru exportul Excel al diagnosticului cu zona de rezolvare și detalii ghidate.

## Migrare SQL

Nu necesită migrare SQL.
