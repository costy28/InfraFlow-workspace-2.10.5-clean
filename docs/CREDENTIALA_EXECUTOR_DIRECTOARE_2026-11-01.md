# Parola SQL a executorului directoarelor — pregătire protejată

Folosește parola EXISTENTĂ a loginului infraflow_demo_directory_executor,
nu SA și nu o parolă nouă. Nu schimbă parola în SQL Server.

Destinații care trebuie să fie absente înainte de instalare:

- /etc/infraflow-demo-platform/directory-executor.password
- /opt/infraflow-demo-platform/releases/directory-executor-sql-check-v1

Unități temporare și identități DynamicUser care trebuie să fie libere:

- infraflow-demo-directory-sql-input-check.service / infraflow-directory-sql-input
- infraflow-demo-directory-sql-check.service / infraflow-directory-sql-check

Installerul root verifică părinții fără symlink, proprietar root, fără
scriere group/other, driver MSSQL existent și sintaxa fișierelor Node.
Pregătește codul root:root 0755/0644; parola este verificată mai întâi prin
stdin sub DynamicUser, fără fișier secret. Numai după succes scrie sursa
root:root 0600 cu O_EXCL și O_NOFOLLOW, fsync, apoi verifică LoadCredential
în a doua unitate DynamicUser, cu acces rețea numai localhost și fără capabilități.

Proba Node acceptă numai identitatea SQL fixă și cele două drepturi EXECUTE
verify_tenant_directory_context / record_tenant_directory_result, fără
drepturi directe, acces ERP sau privilegii administrative. Interoghează numai
metadate; nu execută cele două RPC. Bufferul parolei este golit la încheiere.

Nu instalează serviciu permanent, nu creează directoare tenant, joburi sau
rezultate SQL. Nu repornește ERP-ul sau platforma. În caz de eroare păstrează
fișierele parțiale pentru verificare; nu relua automat, nu șterge/adopta și
nu reseta parola. Root este de încredere; fișierele parțiale pot exista chiar
dacă proba finală nu a fost confirmată.

Verificare locală: patru teste Node trecute (identitate/scope, transport doar
metadate, format credential systemd, golire buffer și închidere la eroare),
node --check pentru ambele fișiere, compilare Python. Probele reale SQL și
systemd rămân de executat pe VPS; nu sunt presupuse trecute din testele locale.
