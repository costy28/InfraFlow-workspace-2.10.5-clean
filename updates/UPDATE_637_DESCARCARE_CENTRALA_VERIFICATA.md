# UPDATE 637 — Descărcare centrală verificată

**Versiune:** 2.12.617  
**Data:** 2 octombrie 2026

## Ce aduce

- aplicația cere ticket-ul de update direct de la server, nu din browser;
- ticket-ul este folosit doar în header pentru o singură arhivă eligibilă;
- pachetul descărcat este verificat față de SHA-256 și dimensiunea din catalogul semnat;
- pe Linux, arhiva se predă atomic worker-ului de update existent;
- pe Windows, se folosește instalarea verificată și restartul controlat existent.

## Configurare necesară

Instanța client va avea nevoie de URL-ul catalogului, cheia publică și credențiala sa individuală în mediul protejat al serviciului. Niciunul nu este transmis către browser.
