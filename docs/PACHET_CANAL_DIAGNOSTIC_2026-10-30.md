# Pachet cod canal diagnostic — 30 octombrie 2026

Acest pachet pregătește exclusiv codul pentru proba worker → Unix → adaptor → SQL.
Nu instalează unități, nu citește/schimbă parole, nu execută SQL și nu preia joburi.
Nu este un update ERP și nu modifică serviciile existente.

## Pregătire pe VPS

1. Verifică SHA-256 al arhivei transferate.
2. Verifică absența release-ului adapter-channel-v1, a socket-ului și a unităților
   infraflow-demo-adapter-review.socket/.service și infraflow-demo-channel-cycle.service.
3. Cu confirmare, rulează stage-demo-adapter-channel.py --stage-confirmed ca root.
   Codul ajunge root-owned, fără scriere pentru worker/adaptor, în release-ul fix.
   node_modules este doar o legătură la driverul deja instalat sql-reader-v1.
4. Dacă există resurse parțiale sau apare eroare: nu relua și nu șterge automat.
   Manifestul stage-manifest.json conține exclusiv nume și SHA-256 ale codului.

## Rulare ulterioară, neexecutată de staging

channel-review-probe.js acceptă exclusiv --check-only sau
--run-channel-review-confirmed, sub worker UID 994/GID 985, fără grupe suplimentare.
Acreditarea vine din LoadCredential al unității infraflow-demo-channel-cycle.service.
check-only consultă doar metadate SQL. Modul de mutație fixează pilotul existent
și revizia 3, fără parametri pentru joburi, SQL, căi sau alte resurse.

Launcher-ul temporar systemd și confirmarea separată pentru rulare urmează.
Nu lansa manual fișierul Node ca root și nu copia parola în env/argv.
Nu porni vechiul worker-check-v1, incompatibil cu scope-ul actual de trei RPC-uri.

## Limita probei

Un succes ulterior ar produce o intenție channel_review_probe și un bilet consumat,
ar elibera lease-ul și ar păstra execution_ready=0. Nu creează resurse tenant,
nu activează compania și nu începe perioada de 15 zile. O eroare incertă nu
declanșează retry sau release compensator: verificăm starea SQL înainte de orice pas.

Codul ciclului a trecut anterior proba SQL nativă pe baza temporară
INFRAFLOW_TEST_TRIALS_BFA11E001587 (passed=true/cleanup=true).
Aceasta nu reprezintă încă acceptanța canalului complet pe VPS.
