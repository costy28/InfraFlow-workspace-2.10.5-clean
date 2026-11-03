# Broker directoare — lansare privată systemd, numai metadate

Pachetul pregătește un release nou directory-preparation-broker-v1. Reutilizează
lease-sql.password prin LoadCredential, fără schimbare sau copie persistentă.
Unitate tranzitorie fixă infraflow-demo-directory-preparer.service, UID994/
GID985 infraflow-demo-worker, fără capabilități, sistem fișiere protejat,
rețea localhost, RuntimeMaxSec120. Niciun serviciu permanent instalat.

Mod --preflight-only: verifică destinația absentă, secretul doar prin stat,
identitatea OS, driverul și sintaxa JS; fără SQL sau scrieri.
Mod --stage-and-probe-confirmed: pregătește codul root, lansează brokerul și
apelează strict init cu binding sintetic, check și shutdown. Bindingul nu este
folosit pentru RPC, nu citește trialul sau jobul. Nu apelează prepare.

IPC limitează pachetul și timpul, verifică secvența și invocationId returnat
la inițializare. La timeout oprește unitatea numai dacă InvocationID este cel
confirmat; altfel oprește doar procesul lansator propriu și cere verificare.
Nu oprește un serviciu înlocuit sau neconfirmat după nume.

Eroare: fără reluare/ștergere automată; codul parțial rămâne pentru verificare.
Nu creează directoare tenant, rezultate SQL sau joburi; nu acordă drepturi și
nu repornește serviciile ERP/platformă. Proba SQL reală pe VPS rămâne separată.

Teste: cinci teste Python pentru comanda fixă, proprietatea invocării și
shutdown; zece teste Node pentru broker/client. Nicio operație OS/SQL reală
nu este executată de aceste teste cu substituenți.
