# UPDATE 238 - Hotfix devalidare pontaj MSSQL

Versiune: 2.12.218

## Problema remediata

- Devalidarea executa reversarile Controlling separat, inaintea actualizarii pontajului.
- O eroare intermediara lasa pontajul validat si bloca aprobarea cererii de concediu.

## Modificari

- Selectarea pontajelor, reversarea append-only si setarea `validat = 0` ruleaza intr-o singura tranzactie MSSQL.
- Reversarile sunt calculate set-based pentru toate pontajele selectate.
- Raspunsul API foloseste numarul real de randuri actualizate.
- Auditul existent si compatibilitatea `DB_MODE=json` sunt pastrate.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm run build`
- Validare manuala: devalidare pontaj iulie, apoi aprobare concediu pe aceeasi perioada.
