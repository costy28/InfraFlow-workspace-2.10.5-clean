# UPDATE 612 — WhatsApp Business: Inbox și lead-uri CRM (v2.12.592)

## Ce aduce

- Configurare separată pentru WhatsApp Business în Mesaje, cu secrete Meta criptate local.
- Endpoint webhook public `https://domeniu-client/webhooks/whatsapp`, verificat cu token și semnătură HMAC SHA-256.
- Inbox WhatsApp pentru mesajele primite; mesajele duplicate sunt ignorate după ID-ul furnizorului.
- Mesajele text, fotografiile și documentele sunt evidențiate în Inbox. Descărcarea binară securizată a media va fi activată după test cu un cont Meta real.
- Acțiunea manuală „Creează lead” creează un lead CRM cu sursa `whatsapp` și audit.

## Ce trebuie pentru activare la client

1. Număr dedicat WhatsApp Business, deținut de client.
2. Meta Business Manager și aplicație Meta cu produsul WhatsApp.
3. Domeniu HTTPS public pentru instanța InfraFlow.
4. Phone Number ID, verify token, app secret și access token introduse exclusiv de administrator.

## Limitări intenționate

- Nu conectează conturi WhatsApp personale și nu folosește automatizări neoficiale.
- Nu trimite încă mesaje/template-uri către client.
- Nu descarcă încă binarul atașamentelor înainte de validarea cu un cont Meta real.
