# Serviciu separat Demo privat — fundație Linux

## Ce există

`server/demo-platform/service.js` este un entry point separat, fără importuri
ERP, DB ERP sau harness-uri de test. Nu este încă serviciul funcțional complet
de administrare Demo. Nicio operație de creare/ștergere companie este expusă.

- Config explicit mode=foundation și port numeric 1024–65535, excluzând 4180/4181.
- Ascultare fixă 127.0.0.1; nu acceptă bind public configurabil.
- GET /health/live: proces activ. GET /health/ready: mereu 503, nu promite readiness.
- Restul rutelor: 404; metode diferite de GET: 405.
- SIGTERM/SIGINT cer oprirea listenerului; fără restart implicit intern.
- Entry point CLI refuză alt OS decât Linux și refuză root.

Modelul `scripts/linux/infraflow-demo-platform.service.example` nu este instalat
și nu creează utilizatorul/directoarele. Propune identitate separată, filesystem
read-only, fără home, capabilități și privilegii noi; jurnal systemd. Node la
/usr/bin/node și portul 4280 sunt exemple de verificat, nu inventar VPS confirmat.
Nu am aplicat restricții asupra serviciului ERP existent.

## Verificări efectuate

3/3 teste locale: config, HTTP, refuz bind public, închidere listener și refuz
repornire după shutdown. Factory testată pe Windows; acestea NU validează
systemd, UID, ACL Linux sau semnalele OS pe VPS. Audit 528 fișiere, zero
constatări. Fără acces VPS, modificări SQL, arhive, versiune nouă sau restart.

## Ce urmează

1. Alegere explicită: același VPS în mediu pilot separat sau alt VPS. Inventar
   read-only pentru Node, systemd, conturi/directoare, SQL și porturi disponibile.
2. Verificare model unit pe Linux, identitate dedicată și pornire/oprire SIGTERM
   în mediu izolat. Instalarea și crearea identităților cer scope confirmat.
3. Adaptor și schemă control plane pentru serviciu, separate de codul test-only;
   conturi SQL cu drepturi minime, fără db_owner runtime. Auth operator cu MFA
   ales explicit înainte de API administrativ.
4. Worker și provisionare restrânsă, ERP A/B reale, izolarea SQL/OS/cheilor,
   gateway/browser/TLS, egress, backup/restaurare și retenție, conform porților.

Această fundație nu este demo privat gata de livrare. Readiness rămâne negativ
și publicarea NO-GO; nu se montează fixture-uri în procesul serviciului.
