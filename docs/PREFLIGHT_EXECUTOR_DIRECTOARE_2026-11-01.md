# Executor SQL directoare — inventar înainte de creare

Pachet exclusiv de verificare în citire. Necesită administrator SQL în baza
INFRAFLOW_DEMO_PLATFORM. Nu creează login/user, nu acordă drepturi, nu citește
parole, nu execută proceduri operaționale și nu repornește servicii.

Verifică migrările 019–021, absența identității SQL fixe
infraflow_demo_directory_executor, lipsa încercărilor/rezultatelor pentru
directoare, lipsa granturilor pe cele patru obiecte noi și snapshotul pilot
queued/revizie 7/generație 3 fără lease și fără activare.

Rezultat așteptat: LIBER pentru login și user, apoi
DIRECTORY_EXECUTOR_LOGIN_PREFLIGHT_OK. Orice refuz cere verificare; nu se
șterge și nu se recreează automat o identitate existentă.

Următorul pas, separat și confirmat: creare identitate SQL dedicată numai
pentru verify_tenant_directory_context și record_tenant_directory_result.
Extinderea workerului pentru prepare_tenant_directories rămâne separată;
profilul existent cu patru RPC nu se modifică implicit.
