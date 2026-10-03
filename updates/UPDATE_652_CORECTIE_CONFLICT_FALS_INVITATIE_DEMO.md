# UPDATE 652 — Corecție conflict fals la invitațiile Demo

**Versiune:** 2.12.632  
**Data:** 3 octombrie 2026

## Ce corectează

- Verificarea de conflict pentru o invitație Demo cere explicit existența unui utilizator cu aceeași adresă de email.
- O adresă nouă nu mai este interpretată ca un cont activ cu utilizator necunoscut.

## Protecții

- Un utilizator existent și activ continuă să oprească aprobarea, fără modificarea contului său.
- Corecția se aplică exclusiv la `POST /api/demo/invites` și nu expune parole, tokenuri sau secrete.
