# Probă temporară de montare a receptorului real

## Stare confirmată înaintea probei

Codul adapter-channel-v1 este pregătit pe VPS. Verificarea worker-ului prin
LoadCredential a returnat CHANNEL_REVIEW_SQL_SCOPE_OK, systemd exit 0.
Acea verificare nu a preluat jobul și nu a creat intenții/bilete.

## Ce face pachetul

1. Verifică identitățile OS și manifestul codului deja instalat, root-owned.
2. Refuză orice socket sau unitate existentă pentru adaptor/proba worker.
3. Creează o pereche socket/service tranzitorie cu systemd-run; nu scrie unități
   în /etc și nu activează pornirea la boot. Serviciul pornește la conectare.
4. Adaptorul primește numai propria acreditare SQL prin LoadCredential.
5. Conectarea vine de la root, fără payload sau ticket. Receptorul real verifică
   SO_PEERCRED și trebuie să refuze peer-ul înainte să invoce bridge-ul Node/SQL.
6. Oprește numai perechea creată de această probă; RemoveOnStop elimină socket-ul.
   Dacă systemd-run eșuează incert, nu adoptă/oprește automat unități parțiale.

Nu rulează worker-ul, nu apelează RPC SQL, nu emite/consumă bilete și nu creează
resurse tenant. Nu modifică serviciile infraflow sau infraflow-demo-platform.
Administratorul root rămâne de încredere; acest test nu promite izolare față de root.

## Utilizare, numai după verificarea arhivei și confirmare

`sudo python3 -B scripts/linux/probe-demo-adapter-channel-mount.py --mount-probe-confirmed`

Markeri așteptați: REAL_ADAPTER_SOCKET_LAZY_START_OK,
REAL_ADAPTER_ROOT_PEER_DENIED_OK, REAL_ADAPTER_MOUNT_CLEANUP_OK,
NO_SQL_RPC_NO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART.

Testele locale verifică structura comenzii și protocolul. Acceptanța reală
systemd/SO_PEERCRED a acestui pachet rămâne de executat pe VPS. Ciclul complet
worker → Unix → Node → SQL va necesita altă confirmare și un launcher separat.
