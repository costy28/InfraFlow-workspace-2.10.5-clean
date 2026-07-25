# UPDATE 399 — Răspunde și redirecționează email din Inbox ERP

Versiune: `2.12.379`  
Data: `2026-07-24`

## Scop

Transformă Inbox ERP din registru + compunere simplă într-un flux conversațional minim: utilizatorul poate răspunde sau redirecționa un email fără să copieze manual expeditorul, subiectul și mesajul original.

## Implementat

- Acțiuni rapide `Răspunde` și `Forward` pe fiecare email din lista Inbox ERP.
- `Răspunde` precompletează:
  - destinatarul cu expeditorul emailului original;
  - subiectul cu prefix `Re:`;
  - categoria și importanța din emailul original;
  - corpul cu antet și mesaj original citat.
- `Forward` precompletează:
  - subiectul cu prefix `Fwd:`;
  - categoria și importanța din emailul original;
  - corpul cu antet și mesaj original citat;
  - destinatarul rămâne liber pentru completare.
- Emailurile trimise ca răspuns sau forward păstrează legătura cu emailul original prin `source_type=email`, `source_id`, `source_label` și `source_url=/mesaje`.
- După trimitere reușită, emailul original este marcat ca citit.

## Fișiere modificate

- `client/src/pages/modules/MessagingPage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Note

Nu s-a schimbat schema DB. Fluxul reutilizează endpointul existent `/api/messaging/email/send`, ceea ce păstrează comportamentul stabil al SMTP și copia salvată în `Trimise`.
