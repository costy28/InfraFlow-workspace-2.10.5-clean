# UPDATE 649 — Acces Demo aprobat din lead

**Versiune:** 2.12.629  
**Data:** 3 octombrie 2026

## Ce aduce

- InfraFlow Demo poate primi, numai dintr-o integrare WordPress semnată, o cerere de invitație aprobată manual.
- Invitația are link unic, expiră după 24 de ore și permite solicitantului să își aleagă singur parola.
- Contul este inactiv până la activare și primește rolul limitat `demo-admin`.

## Protecții

- Funcția rulează exclusiv pe baza Demo comercială izolată.
- Serverul validează semnătura HMAC și fereastra de timp a cererii.
- Parolele și tokenurile de activare nu se salvează în WordPress și nu se trimit prin email.
- O adresă cu cont activ nu poate primi un cont Demo duplicat.

## Configurare necesară

- Secretul comun se păstrează într-un fișier protejat pe serverul Demo și separat în setările modulului WordPress.
- Endpointul acceptat este HTTPS: `https://demo.infraflow.ro/api/demo/invites`.
