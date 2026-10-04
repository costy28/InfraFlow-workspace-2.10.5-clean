# UPDATE 659 — Promovare controlată Preview → Stable

Versiune: `v2.12.639`  
Data: 03.10.2026

## Scop

Un release testat în Preview poate fi pregătit pentru canalul Stable fără
modificarea automată a catalogului public sau a pachetelor.

## Utilitar intern

Scriptul `scripts/promote-preview-release.js`:

- citește separat payload-ul Preview și payload-ul Stable;
- cere versiunea și confirmarea exactă a aceleiași versiuni;
- refuză suprascrierea payload-ului Preview, dublurile în Stable și un catalog invalid;
- scrie payload-ul Stable pregătit pentru semnare;
- adaugă o intrare JSONL de istoric cu momentul și nota aprobării;
- nu semnează și nu publică nimic.

Exemplu, după validarea Preview:

```powershell
node scripts/promote-preview-release.js `
  --preview-input release-catalog/preview.payload.json `
  --stable-input release-catalog/stable.payload.json `
  --output release-catalog/stable.payload.json `
  --history release-catalog/promotion-history.jsonl `
  --version 2.12.639 `
  --confirm-promote 2.12.639 `
  --approval-note "Validat manual pe Demo"
```

Semnarea se face apoi separat, cu cheia privată ținută în afara repository-ului:

```powershell
node scripts/sign-release-catalog.js `
  --input release-catalog/stable.payload.json `
  --output release-catalog/stable.json `
  --private-key-file C:\cale\sigură\catalog-private.pem
```

Publicarea fișierului semnat și a artefactelor rămâne o operațiune explicită a
operatorului. Nu este efectuată de acest update.

## Verificare

```powershell
node --test server/tests/release-catalog.test.js server/tests/promote-preview-release.test.js
```
