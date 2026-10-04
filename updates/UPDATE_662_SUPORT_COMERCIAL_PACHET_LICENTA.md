# UPDATE 662 — Suport comercial pe pachetul licenței

**Versiune:** 2.12.642  
**Data:** 4 Octombrie 2026

## Ce se modifică

- Licența afișează, compact, canalul de suport și regula de prioritate a pachetului activ: Start, Business, Operations sau Enterprise.
- Pagina Tichete arată același context înainte de deschiderea unui ticket nou.
- Tichetele noi rețin cheia pachetului activ la creare (`support_package`), inclusiv în SQL Server. Schimbarea ulterioară a licenței nu rescrie contextul ticketelor deja create.

## Reguli comerciale

- Start: email sau tichet, preluare standard.
- Business: email sau tichet, prioritate peste Start.
- Operations: canal dedicat de suport, cu ticket ca evidență.
- Enterprise: SLA numai conform contractului activ; aplicația nu inventează un SLA contractual.

Nu sunt modificate tichetele istorice. Pentru acestea, ecranul arată contextul licenței curente fără a pretinde că este o înregistrare istorică.
