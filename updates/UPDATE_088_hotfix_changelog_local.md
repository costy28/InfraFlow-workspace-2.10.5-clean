# UPDATE 088 - Hotfix changelog local

Versiune: 2.12.67 -> 2.12.68
Data: 2026-06-19

## Problema

Butonul `Vezi CHANGELOG` din `Setari -> Actualizari` citea doar `CHANGELOG.md`, ramas cu versiuni vechi.

## Rezolvare

- Endpoint-ul local `GET /api/system/update/changelog?local=1` compune acum changelog-ul din fisierele `updates/UPDATE_*.md`.
- Cele mai noi update-uri apar primele.
- `CHANGELOG.md` ramane afisat la final ca istoric vechi.
