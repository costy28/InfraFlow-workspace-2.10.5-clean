# UPDATE 166 - Contabilitate: control operational si interfata

Versiune: `2.12.146`
Data: `2026-06-27`

## Meniu Actiuni

- Componenta comuna `DropdownMenu` este randata prin portal la nivelul paginii.
- Meniul nu mai este taiat de containerele cu scroll orizontal sau `overflow`.
- Pozitionarea este recalculata la scroll si redimensionare.
- Meniul se deschide deasupra butonului cand nu exista spatiu suficient dedesubt.
- Elementele au roluri accesibile `menu` si `menuitem`.

## Asistent inchidere lunara

- Traseu vizual in sase pasi: Documente, Trezorerie, Stocuri, TVA, Balanta, Inchidere.
- Fiecare pas indica starea si deschide direct pagina de rezolvare.
- Controalele existente raman sursa de adevar; nu exista o a doua logica de inchidere.

## Gestiune si facturi

- Lista receptiilor lunii cu starea legaturii spre factura furnizor.
- Sugestii dupa document, denumirea furnizorului si materialele din liniile facturii.
- Confirmarea salveaza legatura in ambele sensuri si este auditata.
- Nu se inventeaza control valoric pentru receptiile care nu contin pret in sursa.

## Mijloace fixe

- Export Excel pentru registrul complet.
- Plan lunar de amortizare pana la valoarea reziduala.
- Fisa HTML tiparibila cu datele mijlocului fix, istoric si plan de amortizare.

## Declaratii

- Export Excel consolidat cu verificarile perioadei si istoricul validarilor/recipiselor.
- Exporturile fiscale raman documente de lucru pana la validarea in fluxurile oficiale ANAF.

## Audit contabil

- Detecteaza documente validate fara nota contabila.
- Detecteaza note fara linii, linii orfane si note dezechilibrate.
- Detecteaza documente posibil duplicate per tert.
- Include problemele de valorizare/sincronizare a stocurilor si controalele declaratiilor.
- Export Excel cu sumar si actiuni recomandate.

## Verificari

- `17/17` teste contabile automate.
- Build React reusit.
- Meniul Actiuni verificat in browser pe server local separat, fara folosirea instalarii de pe portul 4180.
