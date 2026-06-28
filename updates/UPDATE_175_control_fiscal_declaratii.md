# UPDATE 175 - Control fiscal si declaratii

Versiune: `2.12.154 -> 2.12.155`

## Modificari

- Registru fiscal D300 si D394, cu istoric separat pe perioada.
- Tranzitii auditate: validare interna, export, depunere si rezultat recipisa.
- Upload recipise ANAF PDF/XML/ZIP/TXT, maximum 10 MB, stocate in `storage/accounting-declarations/`.
- Amprenta SHA-256 pentru fisierul recipisei si descarcare numai cu autentificare.
- Control incrucisat TVA: documente, jurnale 4426/4427 si balanta.
- Legatura directa factura contabila de iesire validata -> draft e-Factura.
- Marcaj vizual pentru facturile de intrare importate din e-Factura.
- Diagnostic SAF-T pastrat explicit ca instrument de mapare, fara declararea prematura a conformitatii XML.

## Compatibilitate

- Endpoint-ul vechi de inregistrare text a recipisei ramane functional.
- Datele suplimentare ale registrului sunt pastrate in structura existenta `declarationRuns` si in `run_json` pentru MSSQL.
- Nu este necesara o migrare SQL noua.

## Verificari

- `npm run test:accounting`: 40/40 teste trecute.
- `npm run build`: build frontend reusit.
