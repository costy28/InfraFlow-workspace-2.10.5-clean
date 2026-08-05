# UPDATE 507 — Timeline fișă resursă parc

Versiune: `2.12.487`
Data: `2026-08-05`

## Obiectiv

Fișa unui autovehicul/utilaj trebuie să arate rapid istoricul operațional al resursei, fără ca utilizatorul să caute separat prin documente, foi, FAZ, combustibil, reparații și audit.

## Implementare

- Endpoint-ul `GET /api/fleet/assets/:id/full` întoarce acum:
  - `timeline`: ultimele evenimente relevante ale resursei;
  - `timeline_stats`: totaluri compacte pe tipuri de evenimente.
- Timeline-ul combină:
  - documente și scadențe;
  - fișiere încărcate în dosar;
  - alocări șofer/operator;
  - foi de parcurs;
  - FAZ utilaje;
  - alimentări carburant;
  - reparații/intervenții;
  - evenimente de audit asociate resursei.
- Fișa vehiculului/utilajului are tab nou `Timeline`.
- Interfața afișează sumar rapid și listă cronologică descrescătoare.

## Rezultat

Operatorul vede într-un singur loc ce s-a întâmplat cu resursa: cine a folosit-o, ce documente are, ce alimentări/reparații au apărut și ce acțiuni au fost auditate.
