# UPDATE 234 - Pontaj Excel, banca de ore si ture

Versiune: 2.12.214

## Modificari

- Exportul Excel al pontajului pastreaza ordinea Angajat, Departament, Zi 01-Zi 31, Total ore si Zile lucrate.
- Exporturile Excel generice primesc filtru, primul rand fixat si inaltime de antet.
- Orele peste norma zilnica a turei sunt inregistrate automat ca ore suplimentare.
- Banca de ore accepta sold initial pentru ore lucrate inaintea utilizarii aplicatiei.
- Timpul liber acordat in avans este evidentiat ca sold negativ si se stinge cu ore suplimentare ulterioare.
- Orele necompensate in 90 de zile sunt marcate pentru analiza si plata.
- Plata orelor suplimentare genereaza ajustare in statul salarial, cu spor de minimum 75%.
- Turele existente pot fi editate si dezactivate; programarile istorice raman pastrate.
- Permisiunea de inchidere pontaj accepta ambele permisiuni HR existente de validare/aprobare.

## Temei operational

Art. 122-123 din Codul muncii: compensare cu ore libere platite in 90 de zile; daca aceasta nu este posibila, plata cu spor de minimum 75%.

## Verificare

- `npm run test:hr` - 6 teste
- `npm run test:accounting` - 82 teste
- `npm run build`
