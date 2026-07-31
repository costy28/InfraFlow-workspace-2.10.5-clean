# UPDATE 435 — Seed-uri și exemple comerciale generice

Versiune: `2.12.415`
Data: `2026-07-30`

## Scop

Continuă desprinderea produsului de zona pilot/asfalt prin curățarea etichetelor standard, a workflow-urilor implicite și a exemplelor demo vizibile.

## Modificări

- Catalogul intern de module folosește denumiri generale:
  - `Producție / Operațiuni`
  - `Parc & Resurse`
  - `Beton / Prefabricate`
  - `Lucrări / Execuție`
- Seed-ul SQL inițial a fost aliniat cu aceste denumiri.
- A fost adăugată migrarea `069_commercial_generic_module_labels.sql` pentru instalările existente.
- Workflow-urile standard folosesc formulări neutre:
  - `Solicitare output operațional`
  - `Solicitare resursă mobilă`
  - `Output livrat spre execuție`
- Demo-ul din Parc & Resurse și pagina Start Demo folosesc limbaj de operator/equipă mobilă.
- Maparea contabilă pentru producție nu mai descrie explicit asfaltul.

## Verificări

- Scan focalizat pentru texte vechi în fișierele modificate.
- `npm run build`
- `scripts/windows/build-update-zip.ps1`
