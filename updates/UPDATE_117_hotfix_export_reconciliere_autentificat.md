# UPDATE 117 - Hotfix export reconciliere autentificat

Versiune: 2.12.97
Data: 2026-06-23

## Problema

Butonul `Export Excel` din reconcilierea contabila deschidea direct ruta `/api/accounting/reconciliation/export`.
Cum autentificarea frontend-ului se trimite prin header `Authorization`, navigarea directa in browser pierdea tokenul si serverul raspundea cu `Autentificare necesara`.

## Rezolvare

- Exportul foloseste acum `api.get(..., responseType: 'blob')`.
- Fisierul Excel este descarcat local din browser prin `URL.createObjectURL`.
- Tokenul de autentificare ramane atasat cererii prin interceptorul API existent.

## Verificari recomandate

- Intra in `Contabilitate -> Dashboard`.
- Apasa `Export Excel` in cardul `Reconciliere lunara`.
- Verifica descarcarea fisierului `Reconciliere_contabila_YYYY-MM.xlsx`.
