# Lansator ciclu SQL — proba exclusiv de metadate

Release separat: /opt/infraflow-demo-platform/releases/directory-cycle-broker-v1.
Unitate tranzitorie: infraflow-demo-directory-cycle.service, worker UID994/
GID985, fără grupuri suplimentare. Secretul lease existent este livrat prin
LoadCredential; parola nu este citită/afișată de scriptul de instalare.

Preflight: destinație absentă, părinți root fără scriere group/other/symlink,
secret root600 cu un singur link, identitate OS fixă, driver și node --check.
Niciun SQL și nicio scriere în acest mod.

După confirmare: copiere exclusivă cod root755/644, fără suprascriere, fără
schimbarea altor release-uri. Probează strict init(binding sintetic), check,
shutdown. Nu trimite claim/intent/prepare/release și nu citește joburi.
Se verifică autentificarea și exact cele cinci drepturi ale workerului.

Lansarea are RuntimeMaxSec120, fără capabilități, ProtectSystem strict,
ProtectHome, PrivateTmp/Devices și rețea numai localhost. Pipe-ul folosește
deadline25, limită4096 și ID secvențial. O unitate este oprită la timeout numai
dacă InvocationID corespunde handshake-ului; altfel necesită review.

Nu instalează servicii permanente, nu repornește ERP/platforma, nu creează
joburi/directoare tenant, nu modifică parole sau granturi. La eșec nu relua:
release-ul parțial poate exista; nu șterge sau adopta automat.

Verificări locale: teste Python simulate ale lansatorului și proprietății
invocării; teste Node pentru metadatele credențialei și lista de comenzi a
probei; verificări sintactice. Proba reală systemd/SQL rămâne de rulat pe VPS.
