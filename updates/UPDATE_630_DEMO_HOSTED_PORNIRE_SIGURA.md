# UPDATE 630 — v2.12.610 — Pornire sigură demo hosted

## Corecție

Arhivele hosted exclud intenționat rutele tehnice care pot reseta date demo.
În `DEMO_MODE`, aplicația încerca totuși să încarce necondiționat acea rută,
ceea ce oprea pornirea unui pachet valid pentru hosted.

## Rezultat

- aplicația încarcă rutele tehnice demo numai dacă fișierul există în pachet;
- dacă lipsesc, aplicația pornește normal și scrie un avertisment doar în jurnal;
- workerul Linux păstrează validarea și rollback-ul automat pentru orice altă
  eroare de pornire.
