# UPDATE 160 - Contabilitate: avansuri si corectii in trezorerie

Versiune: 2.12.140
Data: 2026-06-26

## Modificari

- Adaugat endpoint pentru clasificarea operatiilor de trezorerie fara factura legata:
  `POST /api/accounting/treasury/:uuid/classify`.
- Operatiile pot fi marcate ca `avans`, `corectie` sau readuse la `neclasificat`.
- Operatiile marcate ca avans/corectie nu mai sunt raportate ca trezorerie necorelata in reconcilierea contabila.
- La legarea unei facturi, operatia este marcata automat ca `factura`.
- Formularul de trezorerie afiseaza campul Corelare si observatii pentru avans/corectie.
- Lista de trezorerie afiseaza badge pentru avansuri si corectii.

## Verificari

- Validarea nu permite corelare `factura` fara o factura selectata.
- Clasificarea este blocata pentru operatii anulate si respecta luna contabila deschisa.
- Build frontend si verificare sintaxa backend.
