# UPDATE 177 - Declaratii, D112 si e-Factura

Versiune: `2.12.156 -> 2.12.157`

## D112

- Diagnostic pentru angajati activi, CNP, contract activ, salariu de baza si pontaj validat.
- Export Excel al datelor sursa si problemelor de completat.
- D112 apare in registrul fiscal si poate avea fisierul oficial si recipisa arhivate.
- Aplicatia nu genereaza contributii sau XML fiscal final pana la implementarea motorului de salarizare.

## Registru fiscal

- D300, D394 si D112 au istoric pe perioada.
- Fisierul declaratiei este separat de fisierul recipisei.
- Fisierele acceptate sunt PDF, XML, ZIP si TXT, maximum 10 MB.
- Exporturile D300/D394 cer validare interna prealabila.

## SAF-T

- Diagnostic extins pentru taxe, mijloace fixe, trezorerie si schema oficiala activa.
- Nu este prezentat drept XML D406 final.

## e-Factura

- Statusul draft/validata/trimisa/acceptata/respinsa este propagat in factura contabila legata.
- Sincronizarea din contabilitate reutilizeaza factura e-Factura existenta dupa UUID sau numar si data.

## Verificari

- `npm run test:accounting`: 44/44 teste trecute.
- `npm run build`: build frontend reusit.
- ZIP verificat fara nume non-ASCII, `.env`, `data` sau `node_modules`.
