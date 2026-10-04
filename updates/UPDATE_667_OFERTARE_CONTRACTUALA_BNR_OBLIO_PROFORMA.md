# Update 667 — InfraFlow v2.12.647: Ofertare contractuală, BNR și proformă Oblio

## Include

- ofertare internă pentru 1, 3, 6, 9 sau 12 luni;
- discount comercial selectat manual și TVA configurabil, inclusiv 0%;
- conversie RON numai cu cursul EUR/RON din XML-ul oficial BNR, păstrat cu data emiterii;
- proformă Oblio emisă manual din comanda CRM confirmată, idempotentă și cu link Oblio pentru Netopia.

## Control operațional

- dacă BNR nu publică încă cursul pentru data aleasă, calculul RON este blocat;
- terțul contabil al clientului este obligatoriu înainte de emiterea Oblio;
- factura fiscală nu se emite automat după proformă sau plată.
