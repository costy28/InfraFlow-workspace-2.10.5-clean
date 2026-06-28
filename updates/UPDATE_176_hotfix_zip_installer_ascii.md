# UPDATE 176 - Hotfix ZIP si instalere ASCII

Versiune: `2.12.155 -> 2.12.156`

## Cauza

Fisierul componentei Asternere continea litere non-ASCII care aratau vizual ca litere latine. Numele era transformat diferit la arhivarea si extragerea ZIP pe Windows, iar updaterul primea `ENOENT` la aplicarea permisiunilor.

## Corectii

- Redenumire definitiva la `AsternerePage.jsx`.
- Importul si identificatorul React folosesc exclusiv ASCII.
- Textele vizibile din instalerele Server si Client sunt fara diacritice.
- Pachetul ZIP este verificat pentru nume de fisiere non-ASCII si continut interzis.

## Verificari

- Build frontend.
- Teste contabile complete.
- Inventar ZIP fara `.env`, `data` sau `node_modules`.
