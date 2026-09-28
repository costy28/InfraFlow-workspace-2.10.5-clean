# InfraFlow v2.12.572 - Hotfix trimitere și decizie ofertă publică

## Ce rezolvă

- Câmpul **Către** din trimiterea unei oferte folosește mai întâi emailul contactului CRM; dacă nu există contact selectat, folosește emailul prospectului/clientului.
- Serverul aplică aceeași regulă de fallback, astfel încât trimiterea nu depinde exclusiv de autofill-ul din interfață.
- Linkul public cere o decizie explicită, apoi confirmarea ei: **Accept ofertă → Confirmă acceptarea** sau **Refuz ofertă → Confirmă refuzul**.

## Siguranță

- Decizia rămâne finală pentru revizia exactă și folosește mecanismul idempotent deja existent.
- Nu se trimit automat emailuri și nu se schimbă statusuri la instalarea update-ului.

## Verificări

- Teste CRM fundație, Sprint 2, Sprint 3 și Sprint 4.
- Build frontend.
- Verificare directă, read-only, a emailului prospectului asociat unei oferte existente.
