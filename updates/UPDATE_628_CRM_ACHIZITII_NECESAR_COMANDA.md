# UPDATE 628 — v2.12.608 — CRM → Achiziții: necesar vizibil și comandă controlată

## Ce rezolvă

- Un necesar creat din deficitul unei comenzi client CRM devine vizibil în tabul **Achiziții → Cerințe**.
- Se afișează materialul, cantitatea și sursa CRM, nu doar o alertă agregată de stoc.
- Butonul **Creează comandă** deschide formularul cu materialul și cantitatea precompletate.

## Control operațional

- Furnizorul, prețul și celelalte detalii sunt completate de Achiziții înainte de salvare.
- Cerința devine `ordered` doar când comanda a fost salvată.
- O reluare a acțiunii pentru aceeași cerință returnează comanda existentă, fără duplicare.

## Compatibilitate

- Endpointul de cerințe acceptă atât dreptul de planificare, cât și dreptul de vizualizare a cerințelor departamentale.
- Rolul demonstrativ Achiziții primește dreptul de planificare la următoarea reinițializare controlată a demo-ului.
