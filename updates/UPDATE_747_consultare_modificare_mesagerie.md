# UPDATE 747 — Consultare și modificare Email/WhatsApp separate

Versiune: **2.12.727**

Interfața dezactivează compunerea, răspunsul/redirecționarea, drafturile, sincronizarea, modificarea statusurilor și legăturilor Email fără `messaging:send`. Handler-ele refuză aceleași operații fără drept. Deschiderea mesajului nu încearcă marcarea citit pentru un cititor. Crearea documentului cere `documents:create`; task-urile păstrează regulile proprii. Operațiile auxiliare de legare/marcare Email sunt omise dacă lipsește dreptul de trimitere.

API-ul de modificare status WhatsApp cere `messaging:send`, nu doar consultare. Configurarea rămâne separată prin `messaging:admin`, iar crearea lead-ului păstrează dreptul CRM dedicat.

Verificări: 43 teste, 18 scenarii HTTP/recitire în JSON temporar, Chrome cu API simulate pentru cititor și expeditor, build și audit expuneri. Nu trimite SMTP/Meta și nu validează integrarea SQL live. Fără schimbări de schemă sau drepturi persistate.

Rămâne auditul accesului la entitățile propuse și existente în legăturile Email. Această etapă nu declară autorizarea întregii mesagerii completă.
