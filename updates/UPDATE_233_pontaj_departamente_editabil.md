# UPDATE 233 - Pontaj departamente editabil

Versiune: 2.12.213

## Modificari

- Grila lunara include toti angajatii activi, inclusiv inregistrarile MSSQL unde marcajul `activ` este necompletat.
- Pontajul poate fi editat prin selectarea oricarei celule angajat/zi.
- Modalul de pontaj permite alegerea tipului zilei, orelor si observatiilor.
- Completare automata cu 8 ore pentru toate zilele lucratoare din departamentul selectat.
- Pontajele existente, concediile si exceptiile nu sunt suprascrise de completarea automata.
- Luna inchisa blocheaza editarea individuala si completarea automata.
- Mesaj explicit cand departamentul nu contine fise HR active.

## Verificare

- `npm run test:hr`
- `npm run build`
