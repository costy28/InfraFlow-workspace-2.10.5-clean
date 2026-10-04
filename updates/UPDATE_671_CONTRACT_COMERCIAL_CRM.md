# UPDATE 671 — Contract comercial Draft din comanda CRM (v2.12.651)

## Flux nou

Din pagina unei oferte CRM acceptate, după crearea comenzii client confirmate,
operatorul poate alege **Pregătește contract Draft**.

Dosarul rezultat păstrează legătura cu:

- comanda client confirmată;
- oferta și revizia sursă;
- moneda și totalul comercial;
- utilizatorul care a pregătit contractul.

Acțiunea este idempotentă: repetarea ei deschide același dosar, fără duplicate.

## Delimitare

Nu sunt create clauze juridice din presupuneri. Dosarul are status `draft` și
trebuie completat în **Contracte** cu perioada, condițiile agreate și documentul
semnat. Nu activează licențe, nu modifică comanda și nu emite proformă/factură.

## Permisiuni

Sunt necesare dreptul de administrare a comenzilor CRM și unul dintre drepturile
de administrare Contracte existente. Superadmin are acces complet.
