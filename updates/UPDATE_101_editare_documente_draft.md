# UPDATE 101 - Editare documente draft

Versiune: 2.12.80 -> 2.12.81
Data: 2026-06-21

## Modificari

- Am adaugat actiunea `Editeaza` pentru documentele draft:
  - in cardurile mobile din lista Documente;
  - in tabelul desktop;
  - in panoul de detalii al documentului.
- Formularul `Document nou din template` este refolosit pentru editare:
  - precompleteaza titlul, prioritatea si variabilele documentului;
  - blocheaza schimbarea template-ului la editare, conform backend-ului existent;
  - salveaza modificarile prin `PATCH /api/documents/:uuid`.
- Butonul de editare apare doar daca documentul este `draft` si utilizatorul curent este initiatorul.

## Verificare recomandata

- Creeaza un document nou fara sa il lansezi in circuit.
- Verifica aparitia butonului `Editeaza` pe mobil si desktop.
- Modifica titlul sau campurile din template, salveaza si redeschide documentul.
- Lanseaza documentul in circuit si verifica faptul ca editarea nu mai este disponibila.
