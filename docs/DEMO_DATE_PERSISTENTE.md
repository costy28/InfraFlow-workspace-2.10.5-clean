# Demo — date persistente și ștergere controlată

Începând cu v2.12.672, datele Demo nu mai sunt proiectate să fie resetate automat la ora 03:00. Un cont Demo activ își păstrează lucrul pe durata accesului configurat de Superadmin.

## Administrare cont Demo

1. Autentifică-te ca **Superadmin**.
2. Deschide **Setări → Utilizatori**.
3. Pentru un cont creat dintr-o solicitare Demo, folosește **Valabilitate Demo** pentru a modifica termenul.
4. Pentru eliminare definitivă, apasă **Șterge Demo**, citește avertizarea și scrie exact `STERGE`.

Ștergerea închide sesiunile contului și elimină înregistrările create de acel cont care au fost marcate explicit după instalarea v2.12.672. Datele istorice, comune sau create înainte de această versiune nu sunt eliminate automat, pentru a nu afecta alți utilizatori ai Demo-ului comun.

## Instalații cu un reset vechi programat

Un pachet de update nu poate dezactiva în siguranță un job de sistem instalat anterior, deoarece numele și mecanismul acelui job pot diferi între servere. După actualizare, administratorul serverului verifică mai întâi ce job există și oprește numai jobul confirmat ca reset Demo:

```bash
systemctl list-timers --all | grep -i infraflow
systemctl list-unit-files | grep -i demo
crontab -l
sudo crontab -l
```

Nu dezactiva servicii sau cron-uri care nu indică explicit resetarea Demo. Resetarea manuală poate rămâne disponibilă separat, ca operațiune deliberată de administrare.
