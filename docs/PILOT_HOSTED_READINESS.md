# InfraFlow — pilot hosted: pregătire tehnică

## Scop

Acest ghid pregătește un pilot controlat. Nu transformă încă produsul în SaaS multi-tenant și nu mută datele unui client real.

Arhitectura pilotului este intenționat simplă:

`browser / InfraFlow.exe → HTTPS (Cloudflare Tunnel sau VPN) → InfraFlow Node pe Windows → SQL Server privat`

SQL Server nu se publică pe internet. Clientul web și clientul Electron folosesc aceeași adresă HTTPS a aplicației.

## Ce poate găzdui pilotul

Runtime-ul curent are Node.js, SQL Server Express și automatizări Windows. Prin urmare, un hosting partajat PHP/MariaDB nu este compatibil cu aplicația server.

Pentru primul pilot se folosește una dintre variantele următoare:

1. o mașină Windows dedicată, aflată sub controlul organizației;
2. un Windows VPS mic, când există buget și un scop de test clar.

Nu este necesar un VPS înainte de a avea condițiile de pilot. Până atunci, se poate valida local pe o instalare separată, cu un subdomeniu tehnic numai după configurarea tunnel-ului.

## Condiții obligatorii înainte de expunere

1. Instalează o instanță separată InfraFlow și o bază SQL Server separată pentru pilot.
2. Setează `APP_KEY` unică, de minimum 32 de caractere, în mediul serverului. Nu folosi cheia implicită.
3. Creează un backup și testează restaurarea lui într-o instanță de test.
4. Configurează SMTP și trimite un email de test din InfraFlow.
5. Configurează un subdomeniu HTTPS, de exemplu `https://demo.infraflow.ro`, printr-un tunnel/proxy controlat sau VPN.
6. Păstrează portul SQL Server în rețeaua privată. Nu crea reguli de firewall care îl expun public.
7. Configurează pornirea persistentă a serverului InfraFlow ca Windows Service sau task de pornire verificat manual.
8. În Setări → Securitate → Pregătire pilot hosted salvează adresa finală HTTPS și rezolvă toate elementele marcate `bad`.

## Test de acceptanță

Folosește conturi de test, nu date reale de client.

1. Deschide adresa publică în browser, dintr-o conexiune din afara rețelei serverului.
2. Autentifică un utilizator de test și verifică o operație cu audit: creează o ofertă, trimite linkul public, apoi verifică auditul.
3. Deschide aceeași adresă în `InfraFlow.exe`; nu se acceptă o adresă locală diferită pentru clientul desktop.
4. Repornește serverul și confirmă că serviciul pornește controlat, fără intervenție manuală.
5. Descarcă backupul, restaurează-l pe instanța de test și verifică datele de bază.
6. Revocă o stație sau închide o sesiune din Setări → Securitate și confirmă auditul.

## Criteriu de oprire

Pilotul nu se oferă unui client real până când testul de acceptanță nu este repetabil și diagnosticul Hosted Readiness nu mai are blocaje. După primul pilot stabil, următorul pas este o instanță dedicată + o bază dedicată pentru fiecare client; nu multi-tenant automat.

## Surse oficiale utile

- Cloudflare: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- Microsoft: [SQL Server security](https://learn.microsoft.com/sql/relational-databases/security/security-center-for-sql-server-database-engine-and-azure-sql-database)
