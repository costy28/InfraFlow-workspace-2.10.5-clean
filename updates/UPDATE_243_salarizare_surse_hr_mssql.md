# UPDATE 243 — Salarizare sincronizata cu sursele HR MSSQL

Versiune: **2.12.223**  
Data: **2026-07-08**

## Corectii

- Salarizarea reincarca angajatii, contractele si pontajele direct din MSSQL la fiecare acces/regenerare, eliminand copia veche pastrata in memorie.
- Contractele cu status SQL `NULL` sunt considerate active, compatibil cu inregistrarile HR existente.
- Controlul impartirii indemnizatiei medicale angajator/FNUASS se aplica fiecarui certificat, nu totalului tuturor ajustarilor.
- Mai multe indemnizatii active in aceeasi luna genereaza avertizare pentru verificarea duplicatelor.

## Operare dupa instalare

Statul salarial deja generat ramane istoric. Pentru preluarea contractului si pontajului corect se foloseste actiunea de regenerare pentru luna respectiva.
