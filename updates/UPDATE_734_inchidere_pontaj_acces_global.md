# UPDATE 734 — Închidere pontaj cu acces global

Versiune: **2.12.714**  
Data: **17 octombrie 2026**

Închiderea lunii este o operație globală. Necesită `hr:timesheets_validate` și domeniu global conform politicii existente de acces la pontaje. Un validator limitat prin `hr:timesheet_dept` nu poate închide sau redeschide luna pentru întreaga organizație. `hr:timesheets_manage` acordă domeniu global, dar nu înlocuiește dreptul de validare.

API-ul de stare transmite `can_manage`; interfața îl verifică înainte să afișeze sau să inițieze acțiunea. Validarea și devalidarea pe angajați păstrează verificarea departamentală.

Nu este necesară migrare SQL. Testele acoperă validator global, validator departamental cu/fără departament, administrare globală explicită și lot mixt de angajați fără scrieri parțiale.
