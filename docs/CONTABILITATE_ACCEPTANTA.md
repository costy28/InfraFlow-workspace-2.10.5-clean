# Acceptanta modul Contabilitate

## Circuit minim obligatoriu

1. Creeaza tertul si factura in status draft.
2. Valideaza factura si verifica nota contabila echilibrata.
3. Inregistreaza plata/incasarea si reconciliaza operatiunea.
4. Verifica jurnalele TVA, registrul jurnal, fisa de cont si balanta.
5. Ruleaza controlul lunii; rezolva toate blocajele explicate de aplicatie.
6. Genereaza declaratiile aplicabile si ataseaza recipisele.
7. Inchide perioada numai dupa backup.

## Verificari tehnice de release

```powershell
npm run test:accounting
npm run test:backup
npm run test:release
npm run build
```

Un release contabil este acceptat doar daca toate comenzile se incheie cu cod 0, endpoint-ul `/api/system/health` raspunde cu `ok: true`, iar baza clientului nu este inlocuita cu date demo.

## MSSQL

- Migrarile sunt versionate in `db/migrations/`.
- Datele curente raman in `dbo.app_state` pana la finalizarea migrarii relationale controlate.
- Tabelele relationale sunt oglinzi verificabile, nu motiv pentru stergerea `app_state`.
- Inainte de orice migrare se face backup SQL si backup aplicatie.

## Fiscal

- D205 este validata local cu schema ANAF `d205_2025_v3.xsd`; adaptorul local corecteaza numai neconcordanta de namespace din XSD-ul publicat.
- Intrastat ramane fisier de lucru si trebuie verificat in aplicatia oficiala INS.
- SPV automat devine activ numai dupa configurarea OAuth ANAF. Fluxul manual ramane disponibil.
