# UPDATE 741 — Navigare după drepturile efective

Versiune: **2.12.721**  
Data: **17 octombrie 2026**

Filtrul comun `canAccess` acordă excepția globală numai superadminului. Rolul admin folosește lista efectivă de permisiuni pentru module. Meniul lateral nu mai sare peste această verificare. Paginile marcate explicit administrative păstrează verificarea de rol existentă.

Căutarea filtrează filele recente după destinațiile cunoscute din catalogul de navigare și drepturile curente. Destinațiile recente neidentificate în catalog nu sunt sugerate; filele originale nu sunt șterse. Lista se recalculează la deschiderea căutării și la schimbarea utilizatorului.

Verificare Chrome cu patru profiluri restrictive și API simulate: CRM absent din meniu și rezultate, filă recentă CRM ascunsă, filă HR permisă păstrată și acces direct CRM refuzat înainte de orice cerere API CRM. Regresii pentru admin cu drepturi restrânse, roluri multiple, superadmin și module dezactivate.

Nu modifică permisiunile salvate sau schema SQL. Scurtăturile interne din paginile altor module rămân în auditul separat.
