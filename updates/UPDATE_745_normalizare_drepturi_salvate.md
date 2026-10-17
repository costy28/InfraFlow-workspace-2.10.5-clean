# UPDATE 745 — Normalizare unică pentru drepturile salvate

Versiune: **2.12.725**

Cele zece adaptoare legacy de normalizare din DB, setup și module delegă normalizării centrale. Catalogul actual este unica sursă pentru validarea override-urilor standard; permisiunile necunoscute și rolurile moștenite din prototip sunt excluse. Semantica listelor explicit goale și excepția superadmin rămân neschimbate.

Nu adaugă permisiuni și nu reconstituie drepturi deja șterse. Acestea trebuie verificate și configurate explicit de administrator. Fără modificări de schemă SQL.

Verificări: 39 teste pentru autorizare/normalizare, incluzând zece adaptoare și întregul catalog; 13 scenarii HTTP/recitire în JSON temporar. Adminul restrâns poate citi documentul partajat, dar administrarea rămâne interzisă. După scrieri, baza este recitită și verificată într-un proces Node nou. Nu reprezintă test SQL Server live.
