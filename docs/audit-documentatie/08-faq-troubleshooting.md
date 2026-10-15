# FAQ și troubleshooting documentabil

Versiune analizată: **v2.12.705**. Soluțiile de mai jos sunt limitate la comportamente identificabile în cod și mesajele observabile.

| ID | Simptom / mesaj | Cauză probabilă susținută | Verificări utilizator | Soluție disponibilă | Contact suport |
|---|---|---|---|---|---|
| TR-01 | „Server indisponibil” / conexiune refuzată la `localhost:4180` | Serverul local nu ascultă sau taskul/serviciul nu rulează | Reîncearcă; verifică adresa afișată | Pornește mecanismul de lansare configurat; administratorul verifică health | Dacă health nu răspunde după pornire |
| TR-02 | Modulul nu apare în meniu | Modul nelicențiat, dezactivat sau rol fără permisiune efectivă | Verifică Setări → Administrare module și rolul | Administratorul activează modulul permis și acordă dreptul punctual | Dacă modulul este licențiat/activ și tot lipsește |
| TR-03 | Acces refuzat la o rută directă | `PermissionGuard` sau middleware backend respinge permisiunea/modulul | Verifică rolul și permisiunea necesară | Administratorul corectează rolul; nu se ocolește protecția | Dacă UI arată acțiunea, dar API o respinge |
| TR-04 | „Ajutorul nu a putut fi încărcat.” | Cererea `/help` a eșuat | Reîncarcă și verifică accesul la aplicație | Reautentificare/reîncărcare; suport verifică serverul | Dacă persistă |
| TR-05 | „Imaginea nu a putut fi încărcată.” | Tip neacceptat, peste 3 MB sau eroare storage | PNG/JPG/WEBP, dimensiune ≤3 MB | Alege fișier conform și reîncearcă | Dacă fișierul conform e respins |
| TR-06 | „Pachetul nu provine din exportul Ajutor InfraFlow.” | ZIP fără manifestul `infraflow-help-library-v1` | Confirmă sursa ZIP | Folosește exclusiv pachetul exportat din Ajutor | Dacă exportul original e respins |
| TR-07 | Importul Ajutor avertizează că înlocuiește biblioteca | Importul este replace integral | Exportă biblioteca curentă înainte | Confirmă numai după backup/export | Dacă trebuie combinare; merge nu este confirmat |
| TR-08 | „Fișierul nu a putut fi generat.” | Export fără permisiune sau eroare server | Verifică dreptul de raportare și filtrul/perioada | Administratorul acordă dreptul justificat; reîncearcă | Dacă API continuă să eșueze |
| TR-09 | Factura/NIR nu poate fi creată sau legată | Date lipsă, furnizori diferiți ori status incompatibil | Verifică furnizor, NIR selectate, total și status | Corectează selecția/datele și repetă | Dacă datele sunt coerente și eroarea persistă |
| TR-10 | Perioada contabilă blochează operația | Perioada este închisă | Verifică luna de lucru și starea închiderii | Folosește o perioadă deschisă sau procedura autorizată | Pentru redeschidere/decizie contabilă |
| TR-11 | Reconcilierea bancară nu propune o factură | Nu există potrivire suficientă după sumă/document/terț | Verifică suma, documentul și facturile deschise | Clasificare/verificare manuală de către rol autorizat | Dacă datele corecte nu apar |
| TR-12 | Import extras: duplicate ignorate | Operația a mai fost importată | Verifică sumarul importului și extrasul anterior | Nu reintroduce manual duplicatele | Dacă o operație legitimă este omisă |
| TR-13 | „APP_KEY env var lipsă” | Cheia de criptare nu este configurată | Utilizatorul nu trebuie să afișeze secrete | Administratorul tehnic configurează/migrează cheia conform procedurii | Întotdeauna în producție |
| TR-14 | Email/IMAP nu sincronizează | DNS, rețea sau credențiale/configurare | Verifică starea integrației fără a expune parola | Reconfigurează/testează din Setări dacă opțiunea există | La erori repetate ECONNRESET/ENOTFOUND |
| TR-15 | Update verificat, dar aplicația nu revine automat | Restart/task/serviciu sau port ocupat | Așteaptă health; verifică statusul mecanismului local | Folosește procedura de restart controlat a instalației | Dacă health rămâne indisponibil |
| TR-16 | Datele nu apar după salvare | Salvare respinsă, filtru activ sau refresh necesar | Verifică mesajul, filtrul și reîncarcă | Corectează validarea și salvează din nou | Dacă API confirmă succes, dar datele lipsesc |
| TR-17 | Câmp sau buton absent | Drept insuficient sau condiție de status | Compară rolul și starea documentului | Folosește rolul corect; nu extinde dreptul fără aprobare | Dacă documentația și UI nu coincid |
| TR-18 | Funcție vizibilă, comportament neclar | Implementare incomplet verificată | Nu opera pe date reale | Marchează „NECONFIRMAT” și testează în mediu controlat | Înainte de publicarea articolului |

## FAQ prioritare

1. De ce nu văd un modul sau un buton?
2. Cum aleg luna/perioada corectă?
3. Cum creez și urmăresc un Task?
4. Cum pornesc un document în circuit?
5. Cum verific cine trebuie să aprobe?
6. Cum creez o ofertă din CRM?
7. Cum înregistrez un NIR și un bon de consum?
8. Cum import și reconciliez un extras bancar?
9. Cum export și import biblioteca Ajutor?
10. Ce informații includ într-un tichet P1–P4?

## Dovezi principale

- Mesaje Ajutor: `client/src/pages/HelpPage.jsx`, `server/modules/system/help-routes.js`.
- Acces efectiv: `client/src/lib/permission-access.js`, `server/core/permissions.js`.
- Update/restart: `server/modules/system/update-routes.js`, `server/modules/system/service.js`.
- Contabilitate: `client/src/pages/accounting/*`, `server/modules/accounting/*`.

