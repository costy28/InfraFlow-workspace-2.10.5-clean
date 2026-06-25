# UPDATE 143 - Hotfix restart si changelog update

Versiune: 2.12.122 -> 2.12.123
Data: 2026-06-24

## Problema

Update-ul putea aparea in istoric, dar serverul ramanea pe procesul vechi daca restartul task-ului Windows nu oprea si procesul Node copil. In plus, fisierele din `updates/` nu erau copiate de ruta de update manual, deci changelog-ul local nu afisa modificarile noi.

## Modificari

- Updaterul copiaza si folderul `updates`.
- Restartul programat opreste explicit procesul serverului curent inainte de repornirea task-ului `InfraFlow ERP`.
- Pastreaza corectiile din 2.12.122 pentru citirea versiunii reale din fisiere si sincronizarea fisierelor package/version.

## Verificare

- Dupa aplicarea update-ului, serverul trebuie sa raporteze versiunea noua la `/api/system/version`.
- Changelog-ul local trebuie sa includa update-urile recente.
