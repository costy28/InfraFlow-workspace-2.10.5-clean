# UPDATE 009 - Export PAAP + Pontaj Nexus

Versiune: `2.10.9`

## Export PAAP SEAP

- Exportul `GET /api/paap/raport?an=2026` genereaza fisierul
  `PAAP_[AN]_[YYYY-MM-DD].xlsx`.
- Structura foloseste cele 14 coloane oficiale Publiserv, cu header pe randul
  `2` si pozitii de plan incepand cu randul `3`.
- Codul si denumirea CPV sunt exportate impreuna.
- Valoarea cu TVA foloseste cota `21%`, iar valoarea EUR este calculata la
  cursul BNR salvat pe pozitia PAAP.
- Formularul PAAP include responsabilul, cursul EUR, datele estimate,
  finantarea, obiectivul local, modalitatea de desfasurare si unitatea
  responsabila.

## Export Pontaj Nexus

- Endpoint nou: `GET /api/hr/timesheets/export-nexus?luna=YYYY-MM&dept_id=ID`.
- Fisierul descarcat foloseste formatul `Pontaj_[Dept]_[LUNA]_[AN].xlsx`.
- Workbook-ul este generat din `db/templates/pontaj_nexus_sablon.xlsx`.
- Fiecare angajat ocupa doua randuri: orele zilnice si codurile de absenta.
- Sunt pastrate pozitiile stricte Nexus, sheet-ul `Legenda`, totalurile si
  footer-ul `Intocmit`.
- Weekend-urile sunt gri, sarbatorile legale sunt rosii, `CO` este galben,
  `CM` este albastru deschis, iar `ABS` este rosu.
- In `HR -> Pontaj` exista butonul `Export Nexus` si modalul pentru luna si
  departament.

## Compatibilitate

- Exporturile functioneaza in `DB_MODE=json` si MSSQL.
- Nu au fost adaugate dependente npm noi.
