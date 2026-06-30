# UPDATE 186 - XML candidat si validare controlata

Versiune: 2.12.165 -> 2.12.166

- Generare XML candidat pentru D112, D300 si D394 din datele perioadei.
- Validare automata prin comanda locala configurata, atunci cand este disponibila.
- Descarcarea variantei verificate este blocata pana la acceptarea validatorului.
- Fisierele, amprenta SHA-256 si rezultatul validatorului raman in arhiva.
- Migrare: `db/migrations/043_accounting_declaration_candidates.sql`.
