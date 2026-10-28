# Worker: ciclu de control fără efecte externe

Stare: modul local, nemontat în serviciu; nu rulează pe VPS.
Jobul VPS confirmat este 00f612ed-a8ac-4688-a26f-679760eee0be, queued, revizie 0,
generație 0, execution_ready=0. Compania b1100b43-48d0-42fa-8a1d-73b1286f8242
este queued, revizie 1, neactivată; un job, șapte rezervări, un audit confirmate de utilizator.

## Ciclu finit

provision-worker-cycle.js primește numai jobId și expectedJobRevision dintr-o
sursă administrativă de încredere, nu din browser. Execută exact:
claim → verify → renew → verify → release. Token aleator criptografic de 32 bytes,
păstrat în memoria ciclului, niciodată în progres sau în erori. Identitatea și
ceasul/generația sunt verificate de SQL. Nu există callback de efecte externe.

Succesul înseamnă checked_and_released, nu completed, provisioning sau instanță
creată. Jobul revine queued și execuția rămâne false. Un ciclu normal incrementează
revizia jobului de trei ori (claim, renew, release), generația o dată.

## Oprire și incertitudine

- Un singur ciclu simultan, fără coadă și fără retry automat.
- Shutdown înainte de claim nu începe o operație nouă.
- Shutdown după un răspuns confirmat așteaptă operația în zbor și eliberează lease-ul
  cu ultima revizie confirmată, fără pași de verificare/reînnoire suplimentari.
- La eroare de claim/renew/verify/release, statusul este neconfirmat, nu cleanup reușit.
  Nu încearcă release cu o revizie despre care nu mai știe dacă este curentă.
- Un răspuns claim pierdut poate lăsa un lease real. Tokenul nu se persistă în acest
  increment; recuperarea ulterioară cere expirare SQL și snapshot curent al jobului,
  apoi un token nou și generație nouă. Nu resetează manual termenul în producție.
- Wrapperul nu deține transportul injectat: apelantul oprește ciclul înainte să
  închidă clientul/pool-ul SQL. Nu există daemon, polling sau pornire automată.

## Ce nu este implementat

Descoperirea durabilă a joburilor, heartbeat de lungă durată, jurnal de progres al
pașilor și reconciliere cu efectele OS/SQL externe. Progresul întors acum este local
și nu înlocuiește jurnalul SQL de lease. Niciun adaptor privilegiat nu este chemat.
Verificarea punctuală a lease-ului nu este garanție atomică pentru efecte externe.

## Probe

Teste unitare: ordine, token privat, false execution authority, revizie veche,
operații incerte fără retry, oprire controlată și refuz payload injectat.
Proba nativă folosește baza/loginul sintetice ale probei lease, nu VPS-ul. Simularea
expirării prin UPDATE este permisă numai administratorului fixture-ului; nu este
un instrument de recuperare instalat. Rezultatul se consemnează după cleanup.

Prima probă nativă s-a oprit cu SQL 451 la interogarea finală CONCAT care combina
stările din două coloane cu collation diferit. Nu a fost ascunsă eroarea și nu
s-a schimbat schema; interogarea fixture-ului a fost corectată cu COLLATE explicit.
Baza INFRAFLOW_TEST_TRIALS_CC6B5B482FB9 și loginul temporar au fost eliminate
(cleanup=true).

Rerularea completă a trecut: 12 grupuri SQL, passed=true și cleanup=true pentru
INFRAFLOW_TEST_TRIALS_460FFF3DDE56. Loginul temporar a fost eliminat confirmat.
Ciclul normal a revenit queued cu execution_ready=0. Răspunsul claim pierdut a
lăsat corect rezultatul neconfirmat, fără retry; după expirarea simulată s-a
preluat cu generație nouă, tokenul vechi a fost refuzat și compania a rămas neactivată.
123 teste Node trecute și zero constatări în auditul fișierelor. Avertismentul
TLS DEP0123 pentru IP rămâne cunoscut și nu este declarat remediat.

Înainte de orice worker permanent trebuie definită și probată identitatea OS
dedicată, separată de operator/ERP, împreună cu accesul exclusiv la credentiala
lease. Identitatea folosită anterior pentru proba metadata systemd nu este prin
ea însăși o acceptanță a izolării unui worker permanent.
