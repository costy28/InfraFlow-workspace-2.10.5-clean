# Client worker și șabloane systemd — 29 octombrie 2026

Implementat local adapter-channel-client.js: conexiune numai la socketul fix,
worker Linux UID 994/GID 985, lstat verifică socket root:985 0660 și /run root-owned
fără write pentru grup/alții. lstat refuză implicit symlink-ul prin tipul obiectului.
Framing EOF, cerere doar intentId/ticketToken, răspuns maxim 4096 bytes ASCII,
deadline absolut 10 secunde. Receipt-ul trece și validatorul clientului SQL.
Conexiune unică per apel, fără retry, erori fără payload/secrete.

Shutdown folosește contractul clientului de bilet: refuză noi apeluri, așteaptă
apelul curent și nu returnează succes târziu. Timeout/disconnect poate surveni
după consum SQL: înseamnă rezultat neconfirmat, nu rollback sau drept de repetare.

Șabloanele .socket.example/.service.example nu sunt instalate sau activate.
Socket Unix root:worker 0660, Accept=no, Backlog=1; serviciul non-root, separat de
operator/ERP, are LoadCredential pentru propria parolă SQL, fără parole în env.
NoNewPrivileges, ProtectSystem, limite resurse, KillMode=control-group și Restart=no.
ConditionPathExists pentru markerul adapter-channel.enabled blochează pornirea
accidentală fără pregătirea separată a mediului. Markerul nu înlocuiește granturile
SQL, identitățile și verificarea conținutului release-ului.

RestrictAddressFamilies permite Unix și IP pentru conexiunea SQL loopback;
IPAddressDeny=any/Allow=localhost nu este filtru pe port și nici probă că API-ul
ERP este inaccesibil. Eficacitatea restricției BPF se verifică pe hostul real.
Nu se folosește PrivateNetwork, care ar separa și loopback-ul SQL necesar.

Surse oficiale consultate pentru socket activation, ACL și LoadCredential:
- https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html
- https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html

## Acceptanță rămasă

Testele locale folosesc socketuri simulate, nu SO_PEERCRED real Linux. Parsarea
INI a șabloanelor nu înlocuiește systemd-analyze verify pe Ubuntu/systemd 255.
Urmează pachet de verificare fără efecte tenant, inventarul identității adaptorului,
acceptarea explicită a eventualelor resurse OS/SQL noi, apoi testul Linux cu peer
permis/refuzat și credentiala proprie. Nu se rulează încă o comandă de instalare.

Pe VPS nu s-a schimbat nimic; schema rămâne până la 009. Loginul lease nu a primit
drepturi suplimentare, nu există credențială sau utilizator nou pentru adaptor.

Rezultate locale: 142 teste Node și 8 teste Python trecute; audit 608 fișiere,
zero constatări. Nu s-a rulat acceptanța kernel/systemd pe VPS prin aceste teste.
