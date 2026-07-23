# UPDATE 389 — Direcție Email ERP organizațional

Versiune: `2.12.369`
Data: `2026-07-23`

## Decizie de produs

- InfraFlow nu va folosi emailuri personale ale utilizatorilor.
- Comunicarea din aplicație trebuie să fie organizațională, auditabilă și legată de fluxurile ERP.
- Direcția corectă este `Comunicare / Inbox ERP`, nu doar configurare SMTP globală.

## Roadmap propus

- Email organizațional per utilizator.
- Inbox integrat în aplicație.
- Categorii și importanță pentru emailuri.
- Filtre după dată, expeditor, categorie, modul, sursă ERP și atașamente.
- Legare email de contracte, task-uri, documente, furnizori, clienți și facturi.
- Conversie email în task sau document intrat.
- SMTP global ca fallback pentru instalări mici și notificări de sistem.
- Viitor: alias centralizat, OAuth/SMTP per utilizator și politici pe tenant.

## Fișiere afectate

- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `updates/UPDATE_388_sursa_task_in_kiosk.md`
- `package.json`
- `client/package.json`
- `server/package.json`
