# UPDATE 114 - Contabilitate: trezorerie corelata cu facturi

Versiune: 2.12.94
Data: 2026-06-23

## Schimbari

- Operatiile din Trezorerie pot fi legate direct de facturi de intrare sau iesire ramase deschise.
- La alegerea facturii, formularul completeaza automat tertul, contul corespondent, documentul, explicatia si suma restanta.
- Validarea operatiei de trezorerie actualizeaza factura legata:
  - plata stinge facturi de intrare;
  - incasarea stinge facturi de iesire;
  - sumele partiale marcheaza factura ca partial stinsa.
- Devalidarea operatiei revine automat restul facturii la valoarea corecta.
- Lista de trezorerie afiseaza factura legata pentru trasabilitate.

## Verificari recomandate

- Creeaza o factura de intrare validata, apoi o plata din Trezorerie legata de factura.
- Valideaza plata si verifica statusul/restul facturii.
- Devalideaza plata si verifica revenirea facturii la statusul anterior.
- Repeta fluxul pentru factura de iesire si incasare.
