# UPDATE 716 — Circuit intern configurabil pentru Referate

Versiune: **2.12.696**  
Data: **14 octombrie 2026**

## Modificări

- Referatele noi folosesc circuitul de tip `referat` configurat în Setări → Fluxuri documente.
- La creare se păstrează un snapshot al versiunii, pașilor, responsabililor și condițiilor aplicabile.
- Schimbarea ulterioară a șablonului nu modifică referatele deja aflate în aprobare.
- Deciziile sunt disponibile numai responsabilului configurat pentru pasul curent; Superadmin păstrează accesul administrativ.
- La aprobarea ultimului pas se generează comanda asociată o singură dată, conform fluxului existent.
- PDF-ul folosește etapele circuitului capturat pentru zonele de semnătură.
- Referatele vechi fără snapshot continuă să folosească circuitul istoric, fără migrare forțată.

## Configurare

Circuitul este administrat de fiecare organizație în **Setări → Fluxuri documente → Referat / necesar intern**. Se pot alege ordinea, denumirea, responsabilul, termenul și condiția fiecărui pas.

## Verificări

- teste pentru snapshot, execuția responsabililor și compatibilitatea circuitului vechi;
- regresii de permisiuni;
- build React/Vite;
- audit de expunere și verificare release;
- arhive Windows și Linux.
