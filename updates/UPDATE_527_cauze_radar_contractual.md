# UPDATE 527 — Cauze vizibile pentru radarul contractual

Versiune: `2.12.507`
Data: `2026-08-20`

## Ce s-a schimbat

- Radarul contractual de pe Dashboard afișează categoriile exacte care cer atenție:
  - fără manager;
  - fără document semnat;
  - depășite valoric;
  - scadente / expirate.
- Fiecare categorie este clickabilă și deschide `Contracte` cu filtrul relevant.
- Calculul folosește datele existente din `/contracts/dashboard` și `/contracts/tasks`, fără endpoint nou.

## De ce

Un utilizator nu trebuie să vadă doar că există risc, ci și cauza riscului. Când cauza este vizibilă direct pe Dashboard, următorul pas devine evident.

## Impact

- Dashboard-ul devine mai practic pentru manageri, achiziții, juridic și contabilitate.
- Contractele cu lipsuri pot fi găsite fără căutare manuală.
- Nu necesită migrare SQL nouă.
