# UPDATE 756 — Rol Demo restrâns fără promovare automată

Versiune: **2.12.736** · Data: **22 octombrie 2026**

Normalizarea DB și helperul setup folosesc aceeași politică de recuperare.
Utilizatorii cu rolul rezervat `demo_company_admin`, principal sau suplimentar,
nu sunt aleși automat drept superadmin când lipsește unul activ, nici dacă au
username `admin`. Nu se schimbă recuperarea legacy pentru ceilalți utilizatori.

Nu se creează conturi ascunse, nu se demotează superadmini existenți și nu se
activează automat wizard-ul sau provisionarea privată. Nu este necesară migrare SQL.
Un trial doar cu roluri restrânse poate rămâne intenționat fără superadmin local;
recuperarea lui administrativă va aparține control plane-ului, încă nelivrat.

Teste: `bootstrap-admin-policy.test.js`, `demo-company-setup-http.test.js` și
varianta restrânsă a `demo-two-instances.test.js`. Aceasta din urmă folosește
exclusiv baze și runtime-uri sintetice, cu scheduler oprit.
