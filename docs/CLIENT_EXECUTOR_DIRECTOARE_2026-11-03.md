# Executor directoare — client SQL local, fără efecte OS

directory-executor-rpc-client.js folosește loginul separat
infraflow_demo_directory_executor și verifică exact două RPC înaintea fiecărei
operații: verify_tenant_directory_context / record_tenant_directory_result.
Reutilizează validarea existentă a scope-ului și interogarea comună de metadate,
fără a schimba fișierele instalate sau pachetele vechi.

Binding strict/imuabil: job, trial, intenție, dovadă OS anterioară, attempt,
generație/revizie și UID/GID. Nu este legat implicit de încercarea generație4
eliberată pe VPS; contextul aceleia nu este reutilizabil.

Context: token fix, receipt exact, căi canonice, contextReady true, buget SQL
15–60sec, executionAllowed false. Nu autorizează singur mkdir. Guardul root
viitor trebuie să scadă latența locală și să revalideze înaintea operației.

Raport observed_created: context verificat anterior în instanță, SHA256 și
exact opt observații ordonate, mod/UID/GID conforme, device/inode uint64 ca
șiruri zecimale canonice, fără duplicate. Digestul nu este calculat/verificat
contra jurnalului OS de acest transport; legarea la jurnal este pas separat.
Raport uncertain: numai explicit, digest null și listă goală. Niciun fallback
automat după răspuns pierdut, niciun retry sau raport terminal duplicat.

Getteri/câmpuri suplimentare sunt refuzate. Config/erori driver nu sunt
returnate. Shutdown așteaptă apelul în curs și refuză rezultatele întârziate.
SQL păstrează autoritatea pentru termenul curent și rezultat unic.

Cinci teste locale cu driver simulat: context/raport parametrizate, uncertain
explicit, policy și uint64/getteri, scope/receipt/conexiune invalide fără
compensare, token/concurență/shutdown. Nu sunt probă reală SQL a noului client.
Nu este livrat pe VPS, nu există lansator sau port root pentru el încă.
