# UPDATE 709 — Acces direct protejat prin module efective

Versiune: **2.12.689**  
Data: **13 octombrie 2026**

## Scop

Închiderea accesului prin URL direct și prin permisiuni implicite atunci când
modulul corespunzător nu face parte din drepturile efective ale instalației.

## Modificări

- permisiunile implicite ale unui angajat sunt filtrate server-side prin
  `effectiveEntitlements`, la fel ca permisiunile rolurilor;
- garda comună din frontend verifică mai întâi cheia canonică a modulului;
- rolurile Admin și Superadmin nu ocolesc în interfață un modul dezactivat;
- rutele CRM folosesc aceeași regulă canonică utilizată în meniu și căutare;
- compatibilitatea este păstrată pentru sesiunile vechi care încă nu conțin
  câmpul `entitlements`, până la reautentificare/reîmprospătarea sesiunii.

## Compatibilitate

- nu se modifică schema bazei de date;
- nu se modifică rolurile sau permisiunile salvate;
- administrarea centrală rămâne disponibilă din Setări;
- protecția backend rămâne autoritatea finală pentru fiecare API.

## Validare

- regresie backend pentru permisiunile implicite HR fără entitlement HR;
- regresie frontend pentru URL direct și rol administrativ;
- build React/Vite;
- audit expunere fișiere, release check și smoke read-only.
