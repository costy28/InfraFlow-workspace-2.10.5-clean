# UPDATE 317 — Helper contextual reutilizabil UI

Versiune: `2.12.297`  
Data: `2026-07-14`

## Scop

Primul pas vizibil spre o aplicație mai intuitivă comercial: un helper contextual reutilizabil care explică utilizatorului ce face pagina, ce pași sunt importanți și care este următoarea acțiune recomandată.

## Modificări

- Adăugat `client/src/components/ui/ContextHelp.jsx`.
- Componenta suportă:
  - titlu și descriere contextuală;
  - badge de zonă;
  - pași cu stare complet/necomplet;
  - tips scurte;
  - buton pentru următorul pas recomandat;
  - tonuri vizuale `info`, `warning`, `success`.
- Integrări inițiale:
  - `Setări > Module` — ghid pentru profil comercial, module și onboarding organizație;
  - HR — ghid pentru Inbox HR, concedii, scadențe și pontaj;
  - Documente — ghid pentru Inbox, document nou și template-uri Word.

## Compatibilitate

- Nu au fost schimbate endpointuri.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Comportamentul operațional existent rămâne neschimbat; update-ul adaugă doar ghidaj UI.

## Verificare

- `npm --prefix client run build` — OK.
- `npm run audit:local` — OK.
