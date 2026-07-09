# UPDATE 244 — Diagnostic surse HR in salarizare

Versiune: **2.12.224**  
Data: **2026-07-09**

## Imbunatatiri

- Fiecare linie din statul salarial include diagnostic pentru sursele HR folosite la calcul:
  - angajat si marca;
  - contract activ sau contracte neeligibile;
  - pontaj lunar, validari si tipuri de zile;
  - concedii, CM, CFP si ajustari salariale active;
  - profil fiscal aplicat.
- In Contabilitate → Salarizare apare avertizare cand datele HR au fost modificate dupa calculul statului.
- Meniul liniei salariale are actiunea **Detalii surse**, cu explicatii operationale si acces rapid spre HR/Pontaj.
- Mesajele despre contract/pontaj lipsa sunt completate cu context, ca operatorul sa stie ce trebuie corectat.

## Verificare

- `npm run test:hr`
- `npm run test:accounting`
- `npm --prefix client run build -- --mode development`
