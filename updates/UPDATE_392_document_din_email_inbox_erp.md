# UPDATE 392 — Document din email Inbox ERP

Versiune: `2.12.372`
Data: `2026-07-23`

## Scop

Leagă Inbox ERP de modulul Documente, astfel încât un email important să poată deveni rapid un document draft urmărit în aplicație.

## Modificări

- `client/src/pages/modules/MessagingPage.jsx`
  - adăugat buton `Document` pe fiecare email din Inbox ERP;
  - adăugat modal `Creează document din email`;
  - modalul încarcă tipurile de document din `GET /api/documents/template-catalog`;
  - documentul este creat prin endpoint-ul existent `POST /api/documents`;
  - emailul este marcat ca citit după conversie, dacă actualizarea este permisă.

## Date păstrate pe document

Documentul primește în `date_json` contextul emailului:

- `source_type=email`;
- `source_id`;
- `source_label`;
- `source_url=/mesaje`;
- expeditor, destinatar, subiect, categorie, importanță;
- preview email;
- indicator și număr atașamente.

## Observații

- Nu s-au introdus tabele noi.
- Se păstrează permisiunile și auditul existente în modulul Documente.
- Integrarea este compatibilă cu `DB_MODE=json` și MSSQL, deoarece folosește endpoint-ul existent.
