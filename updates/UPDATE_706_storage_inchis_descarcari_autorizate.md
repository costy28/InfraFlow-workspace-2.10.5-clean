# UPDATE 706 — Storage închis și descărcări autorizate

Versiune: **2.12.686**  
Data: **13 octombrie 2026**

## Scop

Eliminarea accesului generic la fișierele din `storage`, inclusiv pentru un
utilizator autentificat care ar putea ghici o cale internă.

## Modificări

- ruta generală `/storage` nu mai servește fișiere și răspunde cu 404;
- fallback-ul SPA nu poate transforma o cerere `/storage` într-un răspuns HTML;
- descărcările rămân disponibile numai prin endpoint-urile dedicate ale
  modulelor, cu sesiune, permisiune și verificare pe entitatea asociată;
- Parc & Resurse nu mai persistă calea locală absolută și nu mai salvează URL
  direct către storage;
- modelele Documente salvează o referință internă, nu una publică;
- referințele legacy cu `/storage/` continuă să fie rezolvate numai din
  endpoint-ul autorizat, fără migrare de date;
- auditul de expunere marchează drept critică orice reapariție a unei rute
  generale de servire a folderului.

## Compatibilitate

- nu se modifică schema bazei de date;
- fișierele existente rămân pe disc și pot fi descărcate prin rutele autorizate;
- interfața folosea deja URL-urile API dedicate pentru Parc & Resurse și
  Documente;
- nu este necesară migrare sau intervenție manuală după update.

## Validare

- verificare sintaxă Node pentru fișierele modificate;
- build Vite complet;
- audit strict de expunere fișiere: 388 fișiere, 0 constatări;
- audit comercial izolat: 11/11 verificări, inclusiv acces anonim și autentificat
  refuzat pe ruta generică.
