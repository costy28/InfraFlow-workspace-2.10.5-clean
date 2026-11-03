# Client RPC pregătire directoare — implementare locală

`directory-preparation-rpc-client.js`: identitate infraflow_demo_lease,
profil exact cinci RPC verificat înaintea fiecărei operații. API limitat la
check, prepare și shutdown; numai prepare_tenant_directories este executabil
prin acest client. Niciun broker sau serviciu existent nu este înlocuit.

Binding imutabil cu job/trial/intent/priorOsIntent/attempt, generație/revizie,
UID/GID așteptate din dovada OS. Parserul refuză proprietăți suplimentare,
getteri, numere nesigure și UUID necanonice. Tokenuri distincte, hex lowercase.
Payloadul SQL are exact opt câmpuri, transmis numai ca parametru @json.

Receipt strict: același binding, UID/GID și căi canonice, state prepared,
executionAllowed false; nu conferă autoritate OS. Un singur apel prepare per
instanță, chiar după succes. Nu are reluare automată: orice eroare de transport,
scope sau receipt invalidează instanța. Shutdown așteaptă apelul în curs și
refuză succesul întârziat. Mesajele de eroare nu includ detaliile driverului.

Cinci teste locale cu driver simulat: binding/getteri, parametri și receipt,
token/scope invalide fără RPC, rezultat incert fără retry, concurență și
shutdown. Aceste teste nu reprezintă probă reală SQL a clientului.

Nu este încă livrat/activat pe VPS. Urmează conectarea prin brokerul izolat,
proba de metadate a ansamblului și abia apoi un ciclu SQL controlat, cu
confirmare separată. Nu rula probele vechi cu scope patru.
