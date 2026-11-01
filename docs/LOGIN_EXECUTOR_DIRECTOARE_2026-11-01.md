# Identitate SQL dedicată directoarelor

Creare interactivă, numai după confirmare, prin
`python3 scripts/linux/create-demo-directory-executor-login.py --create-confirmed`.
Necesită toate cele patru fișiere din scripts/linux incluse în pachet.

Reutilizează șablonul verificat al identității adaptorului, cu substituții fixe:
login/user `infraflow_demo_directory_executor`, două RPC:
`verify_tenant_directory_context`, `record_tenant_directory_result`.
Șablonul inclus nu se rulează separat. Nu primește nume sau endpoint din CLI.

Preflight-ul complet se repetă înainte de parole și în tranzacția de creare.
Crearea login/user/granturi este tranzacțională. Drepturile directe pe scheme
sunt refuzate, la fel celelalte proceduri existente. Verificarea folosește o
conexiune reală cu noul login și metadatele drepturilor efective, fără RPC.

Parole: getpass, format 16–128 caractere ASCII imprimabile, aceeași confirmare,
parola nouă diferită de SA. Nu se imprimă; SQL prin stdin, parola conexiunii
prin mediul copilului sqlcmd (nu argv). Root și administratorul SQL sunt de
încredere. Nu se scriu fișiere cu credențiale.

La rezultat incert sau eroare, nu relua: identitatea poate exista. Nu șterge,
nu adopta și nu reseta parola automat. Verifică metadatele separat.

Nu schimbă workerul, jobul, directoarele, conturile OS sau serviciile.
Verificări locale: trei teste Python pentru profil, escaping, metadate și
transport fără parole în argv. Crearea reală și verificarea autentificării pe
VPS rămân de efectuat; testele locale nu pretind că au creat loginul.
