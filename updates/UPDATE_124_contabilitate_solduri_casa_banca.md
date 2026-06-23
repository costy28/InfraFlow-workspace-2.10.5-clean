# UPDATE 124 - Contabilitate solduri casa si banca

Versiune: 2.12.103 -> 2.12.104
Data: 2026-06-23

## Continut

- Registrul de casa si jurnalul de banca calculeaza sold initial pe baza operatiunilor validate anterioare lunii selectate.
- Fiecare operatie din luna primeste sold curent dupa inregistrare.
- Sunt afisate totaluri separate: sold initial, incasari, plati si sold final.
- Daca exista mai multe conturi de trezorerie, pagina afiseaza sumar pe cont.
- Jurnalele de casa/banca folosesc implicit operatiunile validate; drafturile se vad doar cand sunt filtrate explicit.

## Observatii

- Nu introduce tabele noi; soldurile sunt calculate din miscarile existente de trezorerie.
- Exportul Excel include coloana Sold pentru registrul de casa si jurnalul de banca.
