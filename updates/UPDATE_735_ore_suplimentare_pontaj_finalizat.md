# UPDATE 735 — Ore suplimentare pe pontaj finalizat

Versiune: **2.12.715**  
Data: **17 octombrie 2026**

Aprobarea și respingerea orelor suplimentare verifică acum închiderea lunii și validarea zilei după autorizarea accesului la angajat. Luna închisă returnează `HR_TIMESHEET_MONTH_LOCKED`; pontajul validat returnează `HR_TIMESHEET_VALIDATED`. Ambele răspunsuri au status 409 și precedă modificarea datelor.

Pentru corectare, utilizatorul autorizat redeschide luna și/sau devalidează pontajul înaintea deciziei. Pontajele deschise și nevalidate păstrează fluxul obișnuit și controlul departamental.

Nu este necesară migrare SQL. Testele acoperă aprobarea și respingerea pe lună închisă, zi validată, zi deschisă și ramura relațională înainte de UPDATE. Testul relațional folosește un executor controlat; integrarea MSSQL reală rămâne distinctă.
