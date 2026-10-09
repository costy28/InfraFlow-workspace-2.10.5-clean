# UPDATE 703 — Tema vizuală Contabilitate avansată

Versiune: **2.12.683**  
Data: **8 octombrie 2026**

## Scop

Finalizarea uniformizării vizuale a modulului Contabilitate, fără modificarea logicii contabile sau fiscale.

## Modificări

- temă responsive comună pentru plan de conturi, solduri, jurnale, balanță, fișă de cont, Cartea Mare și rezultate;
- situații financiare, centru fiscal, declarații, audit, șabloane, alerte și închidere lună păstrate integral în layout-ul comun;
- tabelul liniilor notei contabile are derulare locală pe ecrane înguste;
- grupurile de acțiuni fiscale și footer-ele de formular se pot rearanja pe mobil;
- smoke-ul vizual contabil acoperă fluxuri de bază și avansate, light/dark, cu toate API-urile interceptate și fără scrieri.

## Compatibilitate

- nu se schimbă API-ul, schema MSSQL, formulele, validările, permisiunile, exporturile sau tipărirea;
- auditul granular al permisiunilor pe subfuncții începe separat după această etapă vizuală.

## Validare

- build frontend;
- smoke vizual complet și smoke vizual Contabilitate;
- regresie contabilă izolată cu provider JSON;
- audit expunere fișiere;
- release check și verificarea arhivelor Windows/Linux.
