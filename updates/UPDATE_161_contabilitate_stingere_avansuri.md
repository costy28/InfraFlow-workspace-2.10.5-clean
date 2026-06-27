# UPDATE 161 - Contabilitate: stingere avansuri cu factura

Versiune: 2.12.141
Data: 2026-06-26

## Modificari

- Adaugat endpoint `POST /api/accounting/treasury/:uuid/settle-advance`.
- Un avans validat poate fi legat ulterior de factura de intrare/iesire potrivita.
- Factura isi actualizeaza automat suma achitata/incasata si restul ramas.
- Nota contabila initiala a avansului nu este rescrisa.
- Operatia de trezorerie primeste link-ul catre factura si audit separat.
- In lista Trezorerie apare actiunea rapida `Stinge avans cu ...` cand exista sugestie de potrivire.

## Reguli

- Se pot stinge doar operatii validate, marcate ca `avans`.
- Operatia nu trebuie sa fie deja legata de alta factura.
- Factura trebuie sa fie validata sau partial stinsa.
- Suma avansului nu poate depasi restul facturii.
- Se verifica perioada facturii inainte de actualizare.
