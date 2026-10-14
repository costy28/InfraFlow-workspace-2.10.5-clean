# UPDATE 711 — Permisiuni granulare Lucrări / Execuție

Versiune: **2.12.691**  
Data: **13 octombrie 2026**

## Scop

Aplicarea reală a permisiunilor declarate pentru modulul Lucrări / Execuție,
astfel încât un drept punctual să nu ofere acces la toate operațiile modulului.

## Modificări

- citirea dashboardului, lucrărilor, progresului și materialelor cere o
  permisiune efectivă a modulului;
- administrarea lucrărilor cere explicit `asternere:manage`;
- citirea și operarea rapoartelor zilnice cer `asternere:rapoarte` sau
  `asternere:manage`;
- interfața ascunde filele și acțiunile care nu corespund drepturilor
  utilizatorului;
- etichetele vechi din editorul rolurilor folosesc acum denumirea
  „Lucrări / Execuție”.

## Compatibilitate

- structura datelor și endpointurile existente nu se schimbă;
- permisiunile salvate își păstrează identificatorii interni;
- Superadmin și Admin respectă în continuare drepturile efective ale modulului.

## Validare

- regresie dedicată pentru separarea citire/raportare/administrare;
- regresiile generale de permisiuni și entitlement-uri;
- build React/Vite;
- audit expunere fișiere și release check.
