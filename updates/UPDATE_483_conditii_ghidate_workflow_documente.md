# UPDATE 483 — Condiții ghidate pentru workflow documente

Versiune: `2.12.463`  
Data: `2026-08-03`

## Scop

Să reducem încă un strat de complexitate din configurarea workflow-ului.

Administratorul nu trebuie să scrie condiții ca text liber dacă vrea o regulă simplă. Poate folosi câmp, operator și valoare, iar aplicația compune condiția lizibilă.

## Implementat

- În editorul de pași din `Setări > Module > Fluxuri documente configurabile`, coloana „Condiție” primește:
  - câmp text existent, păstrat pentru compatibilitate;
  - preset-uri rapide;
  - builder simplu: câmp + operator + valoare;
  - buton „Aplică” care scrie condiția generată în pas.
- Câmpuri disponibile:
  - mereu;
  - valoare estimată;
  - departament;
  - prioritate;
  - țară / jurisdicție;
  - centru de cost;
  - sursă document.
- Operatori disponibili:
  - egal;
  - diferit;
  - mai mare / mai mare sau egal;
  - mai mic / mai mic sau egal;
  - conține.
- Preset-uri rapide:
  - mereu;
  - are valoare estimată;
  - valoare peste prag;
  - prioritate urgentă;
  - prioritate critică;
  - departament beneficiar;
  - țara organizației.

## Compatibilitate

- Nu adaugă tabele.
- Nu schimbă endpoint-uri.
- Nu schimbă încă evaluarea condițiilor în engine.
- Condiția rămâne text în `settings.workflow_document_flows[].steps[].condition`, deci configurațiile existente rămân valide.

## De ce contează

Workflow-ul devine configurabil de oameni normali, nu doar de cineva care înțelege implementarea. Este un pas mic, dar foarte important pentru aplicație comercială: clientul poate modifica reguli fără intervenție în cod.

## Următorul pas recomandat

Maparea condițiilor ghidate într-un format intern structurat, cu evaluare reală în engine: `field`, `operator`, `value`, păstrând textul ca etichetă vizibilă.
