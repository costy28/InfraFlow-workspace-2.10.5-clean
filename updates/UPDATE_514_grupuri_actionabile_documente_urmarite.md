# UPDATE 514 — Grupuri acționabile documente urmărite

Versiune: `2.12.494`  
Data: `2026-08-06`

## Scop

Grupurile din radarul de documente urmărite trebuie să fie drumuri directe de lucru, nu doar statistici. Click pe un grup trebuie să ducă utilizatorul în lista exactă de documente relevante.

## Implementare

- Grupurile `După termen`, `După responsabil` și `După tip document` din Dashboard sunt clickabile.
- Dashboard-ul deschide `Documente` cu:
  - `filter=watched`;
  - `watch_due`;
  - `watch_owner`;
  - `watch_type`.
- `DocumentePage` citește subfiltrele din query string.
- Filtrul `Urmărite` aplică suplimentar subfiltrul de grup.
- Bara de filtru activ afișează grupul aplicat și numărul de documente rămase.
- Când utilizatorul schimbă manual filtrul rapid, subfiltrul de grup se resetează.

## Impact UX

Managerul poate porni din Dashboard direct către lista documentelor întârziate, către documentele aflate la un responsabil sau către un anumit tip de document urmărit.

## Migrare date

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Intră în Dashboard.
2. În panoul `Documente urmărite`, apasă un grup din `După termen`, `După responsabil` sau `După tip document`.
3. Verifică faptul că se deschide `Documente` cu filtrul `Urmărite`.
4. Verifică textul `Filtru activ` și grupul afișat.
5. Apasă `Resetează filtrul` sau alt filtru rapid și verifică resetarea subfiltrului.
