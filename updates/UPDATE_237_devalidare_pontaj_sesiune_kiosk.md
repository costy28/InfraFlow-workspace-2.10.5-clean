# UPDATE 237 - Devalidare pontaj si sesiune Kiosk

Versiune: 2.12.217

## Modificari

- Buton `Devalideaza` in pagina Pontaj.
- Motiv obligatoriu pentru devalidare.
- Devalidare limitata la angajatii si luna selectata.
- Audit complet pentru operatie.
- Reversare append-only a costurilor de manopera trimise in Controlling.
- Un pontaj corectat poate fi validat din nou fara dublarea costului anterior.
- Un raspuns 401 din pagina Kiosk nu mai sterge sesiunea ERP principala.

## Testare

- Valideaza luna, apoi apasa `Devalideaza` si completeaza motivul.
- Editeaza pontajul si valideaza-l din nou.
- In clientul desktop intra in Kiosk si apasa `Inapoi`.
- Utilizatorul trebuie sa ramana autentificat in ERP.
