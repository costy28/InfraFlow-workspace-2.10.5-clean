# Pilot OS — transport privat SQL, în lucru

## Implementat local

- Broker Node separat pe rol: worker (lease și delegare) / executor (acceptare, context, rezultat).
- Inițializare legată de identificatorii jobului și încercării; acțiunile celuilalt rol sunt refuzate înainte de RPC.
- Protocol JSON delimitat, secvențial și limitat la 4096 octeți, pe pipe privat. Nu există listener HTTP sau socket public.
- Credentiale SQL distincte încărcate prin systemd; nici parole în argumente, nici detalii SQL în răspunsurile de eroare.
- Clientul Python oprește după timeout doar unitatea cu InvocationID confirmat de propria sesiune. O unitate înlocuitoare sau neconfirmată necesită verificare; nu este oprită după nume.
- Erorile invalidează canalul. Nu există reluare automată, compensare sau eliberare SQL implicită după pierderea răspunsului.

## Verificări

Trei teste Node pentru fluxul cu driver simulat, limite de protocol și separare pe roluri.
Cinci teste Python pentru comenzile fixe, închidere normală, refuzul opririi unei unități neconfirmate/înlocuitoare și limitarea pachetelor.
Acestea nu reprezintă validare systemd sau SQL reală a noului transport.

## Urmează

1. Proba Linux cu două servicii tranzitorii: numai metadate SQL și refuzuri între roluri, fără preluarea jobului.
2. Verificarea închiderii ambelor servicii și a păstrării stării jobului.
3. Asamblarea porturilor reale ale orchestratorului și verificarea observațiilor OS.
4. Confirmare separată înaintea primei creări de identitate OS.

Pachet de probă: `InfraFlow-demo-os-pilot-sql-brokers-v1.tar.gz`.
Script: `scripts/linux/probe-demo-os-pilot-sql-brokers.py`.
`--check-only` verifică destinații, identități și metadate de credentiale fără citirea parolelor sau SQL.
`--probe-confirmed` instalează exclusiv release-ul nou root-owned și pornește două servicii tranzitorii. Citește metadatele drepturilor SQL, testează refuzuri între roluri și verifică oprirea lor. Nu execută claim/intent/prepare/accept/context/report/release.
Release-ul este păstrat inclusiv după succes; o nouă rulare este refuzată, nu se adoptă sau suprascrie automat. În caz de eșec se păstrează pentru verificare. Serviciile au limita de viață 120 secunde; o oprire neconfirmată cere verificare manuală, nu rerulare.

ERP, serviciile VPS existente și starea trialului nu sunt modificate de probă. Activarea și perioada de 15 zile nu sunt pornite.
