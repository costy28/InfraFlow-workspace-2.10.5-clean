# UPDATE 738 — Decizii concediu fără efecte duplicate

Versiune: **2.12.718**  
Data: **17 octombrie 2026**

Repetarea aceleiași decizii de concediu returnează starea existentă cu 200 fără scrieri suplimentare. Aprobarea repetată nu mai dublează zilele CO consumate și nu rescrie pontajul. Schimbarea directă din aprobat în respins sau invers este refuzată cu 409 și `HR_LEAVE_DECISION_CONFLICT`.

Cererea este verificată înainte de modificare în JSON și MSSQL; respingerea unei cereri inexistente returnează 404. Înregistrările istorice fără stare sunt tratate compatibil ca nedecise. Nu se modifică schema SQL.

Testele acoperă aprobarea repetată, respingerea repetată, inversarea deciziilor și ramura SQL înainte de UPDATE. Integrarea SQL Server reală este un test distinct.
