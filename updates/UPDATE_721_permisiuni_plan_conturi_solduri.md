# UPDATE 721 — Permisiuni Plan conturi și Solduri inițiale

Versiune: **2.12.701**  
Data: **15 octombrie 2026**

## Modificări

- Planul de conturi păstrează consultarea pentru `accounting:view`, dar editarea, analiticele și activarea conturilor cer `accounting:manage`.
- Soldurile inițiale pot fi consultate cu drept de raportare și modificate numai cu `accounting:post`.
- Câmpurile și acțiunile de salvare sunt inactive pentru utilizatorii cu acces exclusiv de citire.
- Accesul direct și navigarea folosesc aceeași regulă de permisiuni.

## Compatibilitate

- Nu se schimbă schema sau valorile contabile existente.
- Rolurile contabile complete își păstrează fluxul actual.

## Verificări

- teste dedicate și regresii de permisiuni;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
