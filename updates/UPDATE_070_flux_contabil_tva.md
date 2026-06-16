# UPDATE 070 - Flux contabil TVA si note manuale

Versiune: 2.12.49 -> 2.12.50
Data: 2026-06-15

## Continut

- Facturile de intrare/iesire folosesc selectori cu planul complet de conturi pentru conturile principale si liniile de factura.
- In modalul de factura exista acces rapid catre administrarea furnizorilor/clientilor.
- Registrul jurnal permite creare de note contabile manuale direct din UI.
- Notele manuale au linii debit/credit, cont selectabil si verificare live debit = credit.
- TVA / D300 are filtre pentru status documente si cota TVA.
- TVA-ul lunii poate fi marcat ca verificat din tabul TVA / D300.
- Inchiderea lunii este blocata daca TVA-ul nu este verificat.

## Observatii

- Blocajul TVA este doar checkpoint operational intern. Declaratiile ANAF raman marcate separat la pasul de depunere.
- Nu se introduc date demo si nu se modifica structura de licentiere.
