# UPDATE 740 — Interfață HR și drepturile rolului admin

Versiune: **2.12.720**  
Data: **17 octombrie 2026**

Interfața HR nu mai presupune că rolul `admin` are toate drepturile. Taburile și acțiunile folosesc aceeași verificare a listei efective de permisiuni. Superadmin păstrează excepția globală, inclusiv când apare în lista de roluri multiple.

Testul `scripts/verify-permissions-ui.cjs` folosește `client/dist`, nu un director de build temporar vechi. Testează Chrome desktop pentru profil propriu, vizualizare HR, citire pontaj și admin restrâns. Verifică lipsa taburilor administrative și de validare nepermise și blocarea celulei validate cu păstrarea editării zilei nevalidate. API-urile sunt simulate în testul vizual; simularea HTTP reală este separată în `npm run test:hr:roles`.

Nu modifică permisiunile persistate sau schema SQL. Scurtăturile de rol din shell sau alte module nu fac parte din această corecție.
