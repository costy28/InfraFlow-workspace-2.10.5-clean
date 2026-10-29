# Adaptor resurse: limite înainte de efecte

## Dovadă VPS primită

Worker UID 994/GID 985 a executat claim/verify/renew/verify/release prin systemd.
Citirea SQL ulterioară confirmă queued/revizie 3/generație 1/execution_ready 0,
fără lease. Compania rămâne queued/revizie 1/neactivată. Repetarea accidentală
a comenzii cu revizie 0 a fost neconfirmată; snapshotul ulterior arată aceeași
stare. Nu se repetă ciclul drept interogare de control. DEP0123 rămâne deschis.

## Implementat local

provision-resource-review.js verifică o proiecție SQL de încredere cu snapshot
job/companie, manifestul și exact șapte rezervări. Resursele sunt rederivate din
UUID și comparate integral; rezervări ale altui job, duplicate, căi modificate,
port/release arbitrar sau snapshot cu lease/activare sunt refuzate. Rezultatul
este imuabil și executionAllowed=false. Nu este adaptor de creare și nici
autorizație: callerul nu poate transforma un JSON valid într-un drept OS/SQL.

Planul vechi provisioning-plan.js era pentru trial revizie 0, înainte de cererea
de job. Nu este reutilizat pentru a respinge trialul legitim care este acum la
revizia 1. Noul review tratează explicit rezervările jobului deja creat.

## Următorul increment obligatoriu

1. Proiecție SQL limitată pentru review, cu identitate dedicată sau procedură
   explicită; fără reutilizarea parolei SA ori extinderea loginului lease.
2. Jurnal durabil per pas și cheie idempotentă job/generație/pas, cu reconciliere
   după efect parțial. Fără declarare exactly-once între SQL și OS.
3. Autoritate restrânsă pentru adaptor: identitate separată, operații enumerate,
   fără shell/SQL/cale din browser, lock de resursă și fencing verificat de
   executor. Verificarea lease urmată de efect nu este atomică.
4. Abia apoi executor OS/SQL, probe negative și acceptarea resurselor exacte.

CHECK execution_ready=0 rămâne intact. Niciun executor, grant, migrare, pachet VPS,
restart, instanță sau activare nu este introdus prin acest increment.
