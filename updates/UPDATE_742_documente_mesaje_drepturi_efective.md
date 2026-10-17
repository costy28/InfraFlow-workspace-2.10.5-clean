# UPDATE 742 — Drepturi efective Documente și Mesaje

Versiune: **2.12.722**  
Data: **17 octombrie 2026**

Documente și Mesaje folosesc verificarea centrală a permisiunilor în locul scurtăturilor locale pentru rolul admin sau al listelor secundare din setări. Citirea documentelor verifică aceleași drepturi efective pe entitate. Șabloanele cer `documents:templates`, iar canalele și configurația WhatsApp cer `messaging:admin`.

Butoanele corespunzătoare folosesc drepturile dedicate și permit administrarea delegată. Trimiterea mesajelor cere `messaging:send` și în interfață. Nu schimbă schema SQL sau permisiunile persistate.

Verificări: nouă scenarii HTTP reale în bază JSON temporară, inclusiv refuz admin restrâns și succes editor șabloane/gestionar canale; Chrome cu API simulate verifică butoanele și absența formularului de trimitere fără drept; regresii WhatsApp și filtru comun de acces.

Vizibilitatea tuturor taburilor și celorlalte acțiuni din Documente/Mesaje rămâne în auditul granular; această notă nu declară toate fluxurile celor două module verificate.
