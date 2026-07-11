# UPDATE 263 — Fisa unica angajat HR

Versiune: 2.12.243  
Data: 2026-07-11

## Scop

Informatiile unui angajat erau disponibile in mai multe zone ale modalului HR. Update-ul reorganizeaza fisa angajatului intr-un profil unic, cu sumar si taburi interne, pentru lucru rapid si audit.

## Functionalitati

- Modalul `Fisa angajat` are sumar superior cu:
  - status contract;
  - procent dosar HR;
  - confirmari Kiosk nefinalizate;
  - urmatoarea scadenta;
  - sold CO.
- Taburi interne:
  - `Date personale`;
  - `Contracte`;
  - `Pontaj & concedii`;
  - `Dosar documente`;
  - `Scadente & Kiosk`;
  - `Echipamente`.
- Tabul `Contracte` pastreaza panoul existent de contracte si acte aditionale.
- Tabul `Dosar documente` pastreaza upload/download/editare documente reale.
- Tabul `Scadente & Kiosk` reuneste lipsurile obligatorii, scadentele apropiate si reminderul Kiosk.
- Buton nou `Fisa angajat` pentru print/salvare PDF din browser.

## Compatibilitate

Nu introduce schema noua si nu schimba endpointurile existente. Refoloseste datele deja incarcate din checklist, dashboard dosar, scadente, contracte, concedii si echipamente.

## Verificari

- `npm run build`
