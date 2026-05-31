# UPDATE 015 - Hotfix sesiune dupa wizard

Versiune: `2.11.5`

## Problema rezolvata

Dupa finalizarea configurarii initiale, serverul emitea o sesiune valida, dar
frontend-ul o ignora si redirectiona utilizatorul la login. Browserul putea
restaura un username vechi, ceea ce crea impresia ca autentificarea nu merge.

## Modificari

- Tokenul emis de `POST /api/setup/complete` este salvat in `localStorage`.
- Username-ul administratorului creat devine valoarea memorata pentru login.
- Aplicatia reincarca direct `/dashboard`, unde sesiunea este validata normal.
