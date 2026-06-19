# UPDATE 087 - Polish vizual global

Versiune: 2.12.66 -> 2.12.67
Data: 2026-06-19

## Schimbari

- Am redus dimensiunea vizuala a butoanelor si am rafinat radius, focus, shadow si spacing.
- Cardurile, inputurile, selecturile, badge-urile si tabelele folosesc variabile CSS comune pentru densitate si font.
- Am adaugat in `Setari -> Aspect` preferinte locale:
  - tema luminoasa / intunecata;
  - densitate compacta / normala / confortabila;
  - marime font 90% - 112%.
- Preferintele sunt salvate in `localStorage`, deci se aplica pe dispozitivul utilizatorului fara modificari de baza de date.
- Navbar-ul este mai compact.

## Observatie

Acesta este primul strat vizual. Dark mode este functional pe componentele principale si va fi rafinat progresiv pe paginile cu stiluri hardcodate.
