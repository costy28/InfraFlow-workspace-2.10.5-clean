# UPDATE 653 — Finalizare invitație Demo pentru email nou

**Versiune:** 2.12.633  
**Data:** 3 octombrie 2026

## Ce corectează

- Username-ul unei invitații Demo este stabilit înainte de scrierea auditului, inclusiv când emailul nu are încă utilizator în Demo.
- O intrare inactivă reutilizată primește username-ul de invitație înainte ca utilizatorul să își aleagă parola.

## Protecții

- Conturile active existente sunt în continuare refuzate înainte de orice modificare.
- Nu se includ parole, tokenuri sau secrete în audit sau răspunsuri.
