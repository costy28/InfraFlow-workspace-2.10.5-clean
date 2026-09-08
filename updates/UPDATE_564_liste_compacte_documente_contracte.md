# UPDATE 564 — Liste compacte în Documente și Contracte

Versiune: `2.12.544`
Data: 2026-09-07

## Context

După compactarea jurnalelor din Setări → Securitate, următorul risc UX era același în modulele de lucru zilnic: Documente și Contracte. Listele mari sunt utile, dar nu trebuie să transforme pagina într-un scroll lung greu de urmărit.

## Modificări

- `CompactTable` acceptă corect atât `data`, cât și `rows`, pentru folosire consecventă în componentele existente.
- `Documente → Template-uri` folosește listă compactă pe desktop.
- `Documente → lista de lucru` folosește listă compactă pe desktop.
- `Contracte → Portofoliu` afișează implicit primele 8 contracte relevante și oferă extindere la cerere.
- Schimbarea filtrelor din Contracte revine automat la afișarea compactă.

## Rezultat

Informațiile complete rămân disponibile, dar pagina pornește dintr-o stare mai scurtă, mai ușor de citit și mai potrivită pentru utilizatori care vor să vadă repede „ce trebuie făcut”.
