# UPDATE 558 — Upload și download controlat în Secretariat (v2.12.538)

Data: 2026-09-07

## Scop

Închide finding-ul de securitate pentru Secretariat: utilizatorul nu mai introduce o cale locală de fișier, iar frontend-ul nu mai lucrează cu `fisier_path`.

## Modificări

- Formularul „Înregistrare nouă” acceptă atașament real prin selector de fișier.
- Sunt acceptate PDF, imagini și documente Office uzuale.
- Backend-ul salvează atașamentul în `storage/secretariat` prin `multer`.
- API-ul de listare registratură serializează atașamentul cu `has_attachment` și `attachment_download_url`, fără cale internă reală.
- Adaugă endpoint controlat `GET /api/secretariat/registry/:id/attachment/download`.
- Download-ul verifică sesiunea, permisiunea `secretariat:view` și faptul că fișierul rămâne în folderul dedicat Secretariat.
- Formularul păstrează compatibilitatea cu datele text existente și normalizează checkbox-ul de email pentru payload multipart.

## Verificări

- `node --check server/modules/secretariat/routes.js`
- `npm run audit:file-exposure`

## Rezultat audit fișiere

Auditul advisory scade de la 3 la 2 finding-uri medium. Secretariat nu mai apare în listă.

## Migrare DB

Nu necesită migrare SQL. Se reutilizează coloana legacy `fisier_path` ca stocare internă, fără expunere către client.
