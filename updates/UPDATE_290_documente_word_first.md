# UPDATE 290 — Documente Word-first

Versiune: `2.12.270`
Data: `2026-07-13`

## Scop

Mută experiența de configurare a template-urilor documente spre fluxul normal pentru utilizatori: documentul se pregătește în Word, iar aplicația păstrează modelul `.docx` ca sursă principală.

## Modificări

- În `client/src/pages/modules/DocumentePage.jsx`, modalul de template pune upload-ul de model Word în prim-plan.
- Variabilele uzuale sunt afișate ca badge-uri copiabile pentru folosire directă în Word, cu sintaxa `{{variabila}}`.
- Modelul curent poate fi descărcat direct din modalul de editare template.
- Editorul vizual/HTML este mutat într-o zonă avansată de compatibilitate și previzualizare.
- Lista de template-uri explică explicit că modelul Word este fluxul principal, iar editorul aplicației este fallback.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- Schema DB rămâne neschimbată.
- Nu s-au adăugat dependențe noi.
- Modelele `.docx`, `.xml`, `.html` și `.htm` rămân acceptate ca înainte.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
