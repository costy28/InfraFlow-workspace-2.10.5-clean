# Login SQL separat pentru executorul OS

VPS: 016 prezentă, infraflow_demo_os_executor login/user LIBER, acceptări și
rezultate zero. Aceasta autorizează pregătirea pachetului, nu crearea fără acord.

Identitate fixă: infraflow_demo_os_executor în INFRAFLOW_DEMO_PLATFORM.
CREATE LOGIN/USER și drepturile sunt într-o tranzacție. Orice identitate existentă
oprește creatorul; nu se schimbă parola sau drepturile unei identități existente.
Doar EXECUTE pe platform.accept_os_identity_delegation și platform.record_os_identity_result.
SELECT/INSERT/UPDATE/DELETE directe pe platform/operator_security sunt refuzate;
celelalte RPC-uri curente sunt refuzate. Fără roluri suplimentare, ownership,
administrare server/bază sau acces la INFRAFLOW_DEMO. CONNECT și permisiunile
public implicite de metadate verificate separat nu sunt drepturi comerciale.

## Fișiere și șablon

Creatorul nou folosește două fișiere existente ca șablon auditat:
create-demo-platform-adapter-review-login.py și restrict-demo-platform-adapter-review.sql.
Acestea nu se execută direct și nu modifică identitatea adaptorului. Profilul este
substituit cu nume și proceduri constante, fără parametri de țintă din CLI/env.
Parola este inserată și escapata DUPĂ substituție, astfel încât conținutul ei nu
poate fi alterat de înlocuirea numelor profilului. Verificatorul cere exact două RPC-uri.

## Rulare viitoare după hash/preflight/acord separat

python3 -B scripts/linux/create-demo-platform-os-executor-login.py --create-confirmed

Se cer parola SA actuală, parola SQL NOUĂ a executorului și repetarea ei.
Noua parolă: 16–128 caractere ASCII imprimabile, distinctă de SA; folosește o
valoare nouă în managerul de parole, diferită și de worker/operator/adaptor.
Nu trimite parola în chat. Nu se cer UUID, TOTP sau parola Linux sudo.

Parolele nu intră în argv ori mesaje. SQL este trimis pe stdin, SQLCMDPASSWORD
există numai în mediul copilului sqlcmd; root/administratorul de host rămâne de
încredere și poate inspecta procesele. Erorile brute SQL sunt capturate, nu afișate.

La eșec după creare nu relua: loginul poate exista. Se verifică starea fără
ștergere automată. Nicio credentială OS nu este instalată de acest pachet;
niciun serviciu root nu este pornit, niciun job/delegare nu este executat.
Următoarea etapă este verificarea acreditării runtime și a transportului SQL.
Autorizarea efectelor host înaintea comenzilor rămâne o poartă separată, încă închisă.

## Verificări locale

Patru teste Python trecute. Proba nativă INFRAFLOW_TEST_TRIALS_C4488182E8E9:
passed=true/cleanup=true, opt grupuri trecute. SQL exact generat de creator:
creare atomică, identitate existentă refuzată, rol db_datareader refuzat,
autentificare SQL reală cu profilul de două RPC-uri, date directe și celelalte
comenzi refuzate. Loginul sintetic INFRAFLOW_TEST_OX_* a fost eliminat.
Apelurile celor două RPC-uri au ajuns la verificarea internă de identitate,
care refuză numele sintetic; nu au acceptat delegări sau raportat rezultate.
Nu s-a creat utilizator OS și nu s-a accesat VPS-ul din aceste teste.
