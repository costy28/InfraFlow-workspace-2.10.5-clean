# Livrare protejată credential registrar — probă separată

Login SQL existent: infraflow_demo_registrar, verificat pe VPS prin markerul
REGISTRAR_LOGIN_SCOPE_VERIFIED. Nu se schimbă parola și nu se creează login nou.

## Pregătire cu confirmare

`prepare-demo-platform-registrar.py --prepare-confirmed`, Linux/sudo/terminal.
Cere parola SQL EXISTENTĂ registrar de două ori, validează formatul ASCII16–128,
fără trim sau transformare. Nu cere SA, auth, parola operatorului sau TOTP.

Creează exclusiv fișierul nou `/etc/infraflow-demo-platform/registrar.password`,
root:root/0600/O_EXCL/O_NOFOLLOW, cu fsync și fără newline. Refuză ținte existente,
symlink-uri și părinți scriibili de alte identități. Fișierul este protejat prin
permisiuni, nu criptat pe disc; nu trebuie publicat sau inclus în pachete.

Release diagnostic nou `/opt/infraflow-demo-platform/releases/registrar-check-v1`,
surse root-owned/0644, directoare 0755, driver mssql privat deja instalat în
sql-reader-v1. Fără npm sau dependențe ERP, fără schimbarea release-ului activ.

## Probă

Unitate tranzitorie infraflow-registrar-check.service, User/Group platform,
LoadCredential=registrar-password:calea_protejată, hardening și limite. Nu se
instalează unitate permanentă sau drop-in pentru serviciul activ. Runtime-ul
citește credentialul doar din directoare systemd allowlisted, verifică fișierul
regular/nlink=1/mode (root:root0440 ACL sau UIDserviciu0400) și dimensiunea.
Bufferul temporar este zeroizat, inclusiv la eșec.

Clientul nou `check()` verifică numai identitatea și drepturile prin query fix.
Proba nu apelează queue(), proceduri sau scrieri SQL. Nu consumă TOTP și nu
creează audit de autentificare al operatorului. Nu repornește servicii existente.
Nu livrează încă credentialul serviciului permanent și nu activează formularul.

Markere: REGISTRAR_CREDENTIAL_SQL_OK, REGISTRAR_SECRET_PREPARED,
NO_RESTART_NO_COMPANY_CREATED. În caz de eroare resursele parțiale rămân pentru
diagnostic, fără retry sau ștergere automată. Nu relua scriptul peste ținte create.

Validare locală focalizată: 9 teste Node pentru client/runtime și 4 Python pentru
pregătire/configurație/limite. Testul systemd și conexiunea reală cu credentialul
copiat rămân de executat pe VPS. Nu se creează companii pentru această probă.
