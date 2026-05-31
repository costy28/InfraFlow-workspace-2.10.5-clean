# UPDATE 007 - e-Factura fix

Versiune: `2.10.7`

## Functionalitati

- TVA `21%` adaugat in lista cotelor disponibile.
- Cota implicita pentru factura noua vine din `settings.tva_implicit`, cu
  compatibilitate pentru `cota_tva_standard` si fallback `21`.
- Facturile existente se pot deschide din lista: drafturile sunt editabile,
  iar facturile validate sunt readonly.
- Administratorul poate debloca explicit editarea unei facturi validate prin
  butonul `[Editeaza]`.
- Backend-ul recalculeaza liniile si totalurile la creare si editare.
- Scrierile pentru facturi si cache-ul partenerilor ANAF sunt inregistrate in
  audit.

## API

- Endpoint nou: `GET /api/anaf/settings`
- Extindere: `PATCH /api/anaf/invoices/:id`
- Permisiuni aplicate explicit: `anaf:view`, `anaf:manage`

## Compatibilitate

- Formularul nou ramane editabil integral.
- Instalatiile care au deja `cota_tva_standard` configurata isi pastreaza
  valoarea.
- Instalatiile fara o cota configurata pornesc cu TVA implicit `21%`.
