# UPDATE 065 - Inchidere luna cu verificari

Versiune: 2.12.44 -> 2.12.45
Data: 2026-06-15

## Ce s-a schimbat

- Am adaugat endpoint de verificare pentru luna contabila: drafturi, note dezechilibrate, balanta si TVA.
- Inchiderea lunii este blocata daca exista documente draft, note dezechilibrate sau balanta nu este echilibrata.
- Marcarea declaratiilor ca depuse este permisa doar dupa inchiderea lunii.
- Pagina `Inchidere luna` afiseaza statusul lunii, blocajele, totalurile relevante si actiunile disponibile.

## Verificari recomandate

- Deschide `Contabilitate -> Inchidere luna`.
- Verifica luna curenta si confirma ca apar blocajele daca exista drafturi.
- Valideaza documentele, apoi inchide luna.
- Testeaza redeschiderea lunii si marcarea declaratiilor depuse.
