# InfraFlow v2.12.568 - CRM Sprint 4: ofertă publică securizată

Data: 27 septembrie 2026

## Ce aduce

- Link public securizat pentru o ofertă aprobată sau trimisă, fixat pe revizia exactă.
- Token generat criptografic; baza de date păstrează numai hash-ul acestuia.
- Expirare configurabilă, revocare, regenerare și limitare a cererilor publice.
- Pagină publică responsive, fără meniu intern, audit, note interne sau identificatori tehnici.
- Acceptare/refuz idempotent; oferta își actualizează statusul, iar responsabilul comercial este notificat.
- Link opțional în emailul ofertei aprobate, fără token în audit sau logurile HTTP.

## Verificări efectuate

- teste CRM fundament, Sprint 2, Sprint 3 și Sprint 4;
- build React;
- audit expunere fișiere;
- verificare structură pachet de release.

## Test recomandat după aplicare

1. Activează CRM din Setări → Module, dacă nu este activ.
2. Deschide o ofertă, trimite-o spre aprobare și aprob-o.
3. Generează un link public, deschide-l într-o fereastră incognito și verifică oferta.
4. Acceptă sau refuză oferta și verifică auditul, statusul și notificarea responsabilului.
5. Creează o revizie nouă și confirmă că linkul vechi nu poate afecta revizia nouă.
