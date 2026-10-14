# UPDATE 708 — Drepturi efective în permisiuni și navigare

Versiune: **2.12.688**  
Data: **13 octombrie 2026**

## Scop

Aplicarea unitară a intersecției dintre licență și modulele activate de
organizație, atât în autorizarea backend, cât și în interfața utilizatorului.

## Modificări

- sesiunea autentificată include `entitlements` și lista `effective_modules`;
- permisiunile rolurilor sunt filtrate server-side prin drepturile efective;
- rolurile personalizate nu mai pot acorda acces la un modul nelicențiat sau
  dezactivat;
- meniul lateral citește cheile canonice ale modulelor;
- căutarea globală filtrează rezultatele prin aceleași module efective;
- Lucrări / Execuție este indexat prin modulul canonic `technical`;
- aliasurile istorice precum `mechanization` și `referate` rămân compatibile.

## Compatibilitate

- nu se modifică schema bazei de date;
- nu se modifică licențele existente;
- modulele Core rămân disponibile conform catalogului canonic;
- utilizatorii Superadmin păstrează administrarea centrală, dar navigarea
  respectă modulele efective ale instalației.

## Validare

- build React/Vite;
- regresii pentru permisiuni granulare;
- teste pentru sesiune și drepturi efective;
- verificare release și audit expunere fișiere;
- smoke read-only pe modulele aplicației.
