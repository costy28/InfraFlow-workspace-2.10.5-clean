# UPDATE 613 — Hotfix Print / PDF ofertă CRM (v2.12.593)

## Ce repară

- Butonul `Print / PDF` pentru o ofertă CRM nu mai poate lăsa utilizatorul într-o filă goală `about:blank` în Chrome.
- Fereastra se deschide direct la click, arată starea de încărcare și primește apoi documentul HTML print-ready.
- Dacă browserul blochează explicit popup-ul, aplicația închide fereastra temporară și afișează o eroare clară cu acțiunea necesară.

## Verificare după actualizare

1. Deschide o ofertă în demo sau în aplicația principală.
2. Apasă `Print / PDF`.
3. Confirmă că fila nouă conține oferta și că `Ctrl+P` permite tipărirea sau salvarea PDF.
