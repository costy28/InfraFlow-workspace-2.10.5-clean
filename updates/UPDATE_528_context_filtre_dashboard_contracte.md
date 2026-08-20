# UPDATE 528 — Context acționabil pentru Contracte din Dashboard

Versiune: `2.12.508`
Data: `2026-08-20`

## Ce s-a schimbat

- Pagina `Contracte` afișează un banner contextual când este deschisă din radarul Dashboard cu filtre de risc.
- Bannerul explică motivul listei filtrate:
  - contracte fără manager;
  - contracte fără document semnat;
  - depășiri valorice;
  - scadențe apropiate sau contracte expirate;
  - contracte critice, cu task-uri restante sau cu alerte.
- Din banner se poate selecta direct lista vizibilă.
- Acțiunea recomandată pornește direct fluxul potrivit:
  - `Setează manager în lot` pentru contractele fără responsabil;
  - `Creează task-uri` pentru restul blocajelor operaționale.
- Dacă utilizatorul modifică manual filtrele, resetează sau alege o vedere salvată, contextul venit din Dashboard se ascunde.

## De ce

Radarul din Dashboard trebuie să ducă utilizatorul nu doar la o listă, ci la următorul pas clar. Astfel un manager vede cauza, numărul de contracte afectate și acțiunea de rezolvare fără să caute prin filtre.

## Impact

- Contractele riscante devin mai ușor de curățat în lot.
- Fluxul Dashboard → Contracte este mai intuitiv pentru utilizatori noi.
- Nu necesită migrare SQL nouă.
