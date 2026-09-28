# UPDATE 602 — CRM: flux comercial compact pe Dashboard

Versiune: `2.12.582`  
Data: `2026-09-28`

## Ce aduce

- Pagina principală **CRM / Vânzări** afișează un rezumat separat al fluxului comercial:
  - oferte de aprobat;
  - oferte care așteaptă decizia clientului;
  - oferte acceptate;
  - comenzi confirmate.
- Fiecare etapă explică într-o propoziție următorul pas operațional și deschide lista ofertelor relevante.
- Numerele sunt calculate server-side, numai ca sumar; nu sunt modificate stocul, achizițiile, facturile sau comenzile.

## Verificare

1. Deschide **CRM / Vânzări**.
2. Verifică panoul **Flux comercial** și valorile celor patru carduri.
3. Deschide un card: aplicația ajunge la **Oferte**, fără a schimba date.
