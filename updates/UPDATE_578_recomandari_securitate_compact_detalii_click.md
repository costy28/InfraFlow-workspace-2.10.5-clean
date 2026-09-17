# UPDATE 578 — Recomandări securitate compacte cu detalii la click

Versiune: `v2.12.558`  
Data: `2026-09-17`

## Scop

Panoul de recomandări din Setări → Securitate nu mai extinde pagina cu texte și liste lungi, dar păstrează accesul complet la informațiile administrative.

## Modificări

- pagina arată rezumatul accesului și numărul de puncte de urmărit;
- click pe carte deschide recomandarea de acces, protecția bazei de date și avertizările complete;
- lipsa avertizărilor este indicată explicit;
- datele sensibile nu sunt afișate în rezumat sau în detalii.

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
- generare și validare ZIP update
