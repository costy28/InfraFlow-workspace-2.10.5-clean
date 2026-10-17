# UPDATE 732 — Notificări de pontaj limitate la departamentul autorizat

Versiune: **2.12.712**  
Data: **17 octombrie 2026**

Notificările de finalizare respectă domeniul de acces folosit de aprobarea pontajului. Utilizatorii limitați prin `hr:timesheet_dept` primesc notificări numai pentru departamentul asociat. Lipsa departamentului exclude notificarea. Dreptul `hr:timesheets_manage` păstrează accesul global.

Compararea normalizează ID-ul și codul departamentului prin nomenclatorul existent. Schema SQL nu necesită migrare.

Testul pe ruta de finalizare acoperă aprobatori din același departament (ID și cod), alt departament, fără departament și administrator global.
