# UPDATE 601 — Confirmare clară pentru emiterea în Oblio (v2.12.581)

## Ce se schimbă

- Butonul „Emite factură în Oblio” nu mai folosește confirmarea nativă a browserului.
- InfraFlow afișează un dialog standard, cu explicația faptului că se emite o factură reală.
- Dialogul amintește explicit că factura draft internă este obligatorie, stocul Oblio nu este modificat și trimiterea automată în SPV rămâne oprită.

## Verificare

1. Deschide o comandă client confirmată, cu factură draft în Contabilitate.
2. Apasă „Emite factură în Oblio”.
3. Verifică dialogul și alege „Renunță” sau „Emite factura”.
4. Doar confirmarea explicită trimite cererea către Oblio.
