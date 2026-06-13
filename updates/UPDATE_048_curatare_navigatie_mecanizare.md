# UPDATE 048 - Curatare navigatie Mecanizare

Versiune: 2.12.26 -> 2.12.27
Data: 2026-06-11

## Schimbari

- Eliminat link-ul separat `FAZ Utilaje` din bara principala din stanga.
- Mutat accesul vizibil la FAZ Utilaje in modulul Mecanizare, langa `Foi Parcurs`.
- Adaugat acces rapid `Registru FAZ` in tabul `FAZ Lunar`.
- Pastrata ruta tehnica `/faz-utilaje`, pentru compatibilitate cu link-uri existente si navigare interna.

## Motiv

Submodulele trebuie sa ramana in modulul caruia ii apartin. FAZ este parte din Mecanizare, nu modul principal separat.

## Verificari

- Sidebar fara intrare separata pentru FAZ Utilaje.
- Mecanizare ofera acces direct catre FAZ Utilaje.
- Build client si installer complet se refac pentru versiunea 2.12.27.
