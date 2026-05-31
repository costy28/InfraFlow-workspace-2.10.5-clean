# UPDATE 012 - Stabilizare update, HR si GPS

Data: 31 Mai 2026
Versiune: 2.11.2

## Fix-uri

- Upload-ul ZIP nu mai forteaza manual antetul multipart din browser.
- Validatorul ZIP accepta `version.json` la radacina sau intr-un singur director exterior si returneaza erori explicite pentru arhive invalide.
- Aplicarea ZIP copiaza `version.json`, changelog-ul, seed-ul CPV, sabloanele SQL si scripturile livrate.
- Modulul server include un fallback CPV local pentru primul update aplicat de un updater vechi.
- HR incarca departamentele din nomenclatorul central, nu doar din angajatii deja introdusi.
- Cardul CPV explica sursa catalogului inclus si rolul butonului de resincronizare.
- Testul GPS salveaza configurarea inainte de conectare.
- Furnizorii GPS alternativi pot fi configurati cu URL API JSON/XML si token Bearer optional.
- Diagnosticul Raw GPS foloseste campul corect `raw_length`.

## Compatibilitate

- Integrarea existenta `urmariregps.ro` ramane implicita.
- Modul `DB_MODE=json` ramane functional.
