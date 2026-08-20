# UPDATE 526 — Radar contractual pe Dashboard

Versiune: `2.12.506`
Data: `2026-08-20`

## Ce s-a schimbat

- Am adăugat pe Dashboard un panou dedicat pentru portofoliul contractual.
- Panoul afișează:
  - contracte active / total contracte;
  - contracte critice;
  - avertizări și scadențe;
  - task-uri contractuale restante;
  - valoare consumată, valoare contractată, procent global și rămas estimat;
  - primele riscuri contractuale;
  - managerii de contract cu alerte active.
- Modulul Contracte poate citi filtre din URL, astfel încât Dashboard-ul deschide direct vederea relevantă.

## De ce

Contractele sunt deja conectate cu documente, task-uri și consum, dar prima pagină trebuie să arate rapid unde există risc. Utilizatorul nu trebuie să ghicească unde să intre după ce vede o alertă.

## Impact

- Dashboard devine mai acționabil pentru director, achiziții, juridic, contabilitate și managerii de contract.
- Contracte suportă deep-link-uri pentru vederi salvate și filtre operaționale.
- Nu necesită migrare SQL nouă.
