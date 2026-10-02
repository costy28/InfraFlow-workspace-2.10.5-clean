# UPDATE 638 — Credenciale update în fișiere protejate

**Versiune:** 2.12.618  
**Data:** 2 octombrie 2026

## Ce aduce

- `INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY_FILE` permite configurarea cheii publice Ed25519 dintr-un fișier local;
- `INFRAFLOW_UPDATE_CLIENT_TOKEN_FILE` permite configurarea tokenului de instalație dintr-un fișier protejat;
- secretul nu trebuie copiat ca text în `infraflow.env` și nu este expus către browser.
