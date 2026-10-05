# UPDATE 685 — Execuție cursă Logistică (v2.12.665)

## Scop

Înregistrează separat momentele reale ale unei curse, după planificare și
înaintea confirmării de livrare.

## Ce este nou

- Acțiune controlată pentru plecarea efectivă: cursa devine `În cursă`.
- Acțiune controlată pentru sosirea efectivă: cursa devine `Sosită`.
- Sosirea cere o plecare reală existentă și nu acceptă un moment anterior.
- Fiecare etapă se păstrează în istoricul cursei și în audit, cu operator și
  observații opționale.

## Limite explicite

- Momentele sunt introduse manual; nu sunt colectate din GPS, foi de parcurs
  sau aplicații externe.
- Confirmarea de primire și dovada de livrare rămân acțiuni distincte.
- Nu se transmite nimic către RO e-Transport, ANAF, transportatori sau alte
  sisteme externe.
