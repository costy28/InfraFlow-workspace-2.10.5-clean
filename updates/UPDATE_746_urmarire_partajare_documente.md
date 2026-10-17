# UPDATE 746 — Urmărire și partajare documente după acces

Versiune: **2.12.726**

Lista JSON de partajate exclude expirările și potrivirile de departament absent. SQL folosește EXISTS pentru a evita dublurile. Modificarea urmăririi în MSSQL verifică accesul pe entitate înainte de actualizare; lista urmăritelor recunoaște accesul prin circuit și partajare neexpirată. Urmărirea nu acordă acces.

Interfața nu cere emailurile legate și nu deschide sursa email dacă lipsește `messaging:view`. Metadatele deja incluse în conținutul unui document nu sunt șterse sau rescrise. Task-urile păstrează politica existentă: creare proprie, delegare doar potrivit regulilor Task Management.

Verificări: 39 teste, 16 scenarii HTTP/recitire în JSON temporar, Chrome cu API simulate și profil fără drept de mesaje. Fără integrare SQL live în această etapă. Nu schimbă schema.

Rămâne auditul API-urilor Email/WhatsApp și al legăturilor către entități; aceasta nu declară toate fluxurile de mesagerie finalizate.
