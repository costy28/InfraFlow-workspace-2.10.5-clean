# UPDATE 654 — Valabilitate acces Demo: 15 zile

**Versiune:** 2.12.634  
**Data:** 3 octombrie 2026

## Ce adaugă

- Un cont creat dintr-o solicitare Demo aprobată primește implicit 15 zile de acces după activarea parolei.
- În **Setări → Utilizatori**, superadminul vede termenul contului Demo și îl poate modifica sau elimina.
- Termenul eliminat înseamnă acces fără expirare automată; dezactivarea manuală existentă rămâne separată.

## Protecții

- După expirare, login-ul și o sesiune Demo deja deschisă sunt refuzate pe server.
- Contul, datele și auditul nu sunt șterse; nu se schimbă automat câmpul de dezactivare.
- Doar superadminul poate modifica termenul, iar modificarea este păstrată în jurnalul de securitate.
