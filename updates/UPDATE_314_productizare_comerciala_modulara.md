# UPDATE 314 — Productizare comercială modulară

Versiune: `2.12.294`  
Data: `2026-07-14`

## Scop

Reorientarea InfraFlow dintr-o aplicație crescută în jurul unui pilot real într-un produs comercial general, modular și configurabil pentru mai multe tipuri de organizații.

## Modificări

- Actualizat `AGENTS.md`:
  - InfraFlow este definit ca ERP comercial modular;
  - eliminată poziționarea ca produs dependent de client pilot activ;
  - adăugată direcția comercială activă;
  - secțiunea de client pilot a fost înlocuită cu profiluri comerciale și note istorice.
- Adăugat `docs/PRODUCTIZARE_COMERCIALA.md`:
  - pachete comerciale propuse;
  - profiluri de pornire;
  - reguli de decuplare de client;
  - elemente de UX care cresc adopția.
- Neutralizate texte și fallback-uri vizibile:
  - editor template documente;
  - Start Demo;
  - HR Documente;
  - Controlling;
  - foi parcurs;
  - Mediu;
  - importer legacy.
- În controlling, denumirile interne `publiserv*` au fost redenumite generic `default*`, păstrând datele și comportamentul.

## Compatibilitate

- Nu au fost schimbate endpointuri API.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Setările reale ale unei organizații continuă să suprascrie fallback-urile generice.

## Verificare

- `npm run audit:local` — OK.
