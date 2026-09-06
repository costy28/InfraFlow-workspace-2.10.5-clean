# UPDATE 551 — Download controlat pentru modele documente

Versiune: **2.12.531**
Data: **2026-09-05**

## Ce s-a schimbat

- API-ul Documente nu mai expune către frontend calea internă/publică `/storage` pentru modelele de template.
- Răspunsurile pentru template-uri includ `has_model_file` și `fisier_model_download_url`, folosite de interfață pentru descărcare.
- Endpoint-ul `/api/documents/templates/:id/download-model` validează strict că fișierul rămâne în `storage/document-templates`.
- Upload-ul de model întoarce metadate curate, fără `file_path` public.
- Frontend-ul Documente păstrează acțiunile de descărcare folosind URL-ul controlat.
- Smoke testul comercial verifică explicit că lista de template-uri nu mai scapă `/storage` în `fisier_model_path`.

## Impact

- Modelele Word/XML/HTML din Documente sunt accesate prin API, nu prin URL public de storage.
- Fișierele deja salvate rămân compatibile, pentru că path-ul vechi poate fi folosit intern de server.
- Nu schimbă schema bazei de date și nu necesită migrare SQL nouă.

## Verificări

- `node --check server/modules/documents/routes.js` ✅
- `node --check scripts/audit-commercial-smoke.js` ✅
- `npm run audit:commercial-smoke` ✅ 11/11 verificări trecute.
- `npm run build` ✅
- 
pm run release:check -- --no-zip ✅
- 
pm run audit:local ✅