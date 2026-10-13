# UPDATE 707 — Catalog canonic module și drepturi efective

Versiune: **2.12.687**  
Data: **13 octombrie 2026**

## Scop

Eliminarea definițiilor backend divergente pentru module, pachete comerciale și
aliasurile istorice folosite de licențe.

## Modificări

- catalog unic în `server/core/module-catalog.js`;
- chei canonice separate pentru modulele Core și modulele configurabile;
- aliasuri legacy normalizate pentru denumirile istorice și comerciale;
- citire comună pentru câmpurile de licență `module`, `modules` și `addons`;
- funcție `allowedModulesForLicense` unică pentru Setări și sistem;
- funcție `effectiveEntitlements` care întoarce modulele permise, configurate și
  efective;
- Setări → Administrare module consumă grupurile și pachetele din catalogul
  canonic;
- verificarea fundației CRM folosește aceeași normalizare.

## Compatibilitate

- licențele existente nu trebuie regenerate;
- aliasurile istorice rămân acceptate;
- nu se modifică schema sau datele din baza de date;
- middleware-urile modulelor nu sunt schimbate în această etapă.

## Validare

- verificare sintaxă Node;
- 11/11 teste pentru catalog, terminologie și fundația CRM;
- test explicit pentru intersecția licență–configurare;
- test explicit pentru echivalența licențelor legacy și moderne.
