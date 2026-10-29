# Recepție locală bilet adaptor — implementare nemontată

adapter-review-socket.py definește un receptor AF_UNIX activat prin socket
systemd, nu un listener TCP. Calea este fixă /run/infraflow-demo-adapter-review.sock.
Socketul trebuie creat root:grup worker (985), mod 0660, iar serviciul trebuie să
ruleze non-root ca infraflow-demo-adapter-review. Această identitate nu a fost
creată pe VPS prin acest increment. Nu există încă fișiere de unitate instalate.

Acceptarea verifică SO_PEERCRED din kernel, UID worker 994; PID/UID din JSON nu
sunt acceptate ca autoritate. Un singur apel este procesat simultan. Cererea
trebuie încheiată cu EOF (client half-close), maximum 1024 bytes ASCII, termen
absolut 3 secunde, exact intentId și ticketToken. Duplicate, câmpuri suplimentare,
token lease, roluri ori căi sunt refuzate. Nu există retry automat.

Backendul este un proces Node cu cale fixă root-owned, fără shell sau token în
argv, datele fiind trimise pe stdin privat. Timeout backend 8 secunde. Bridge-ul
adapter-consume-stdin.js citește numai credentiala systemd adapter-sql-password,
construiește profilul SQL consumer și apelează exclusiv consume. Receipt-ul este
validat din nou de receptor: fără token/hash, cu executionAllowed=false.

Erorile backend nu sunt returnate/logate cu payloadul; răspuns generic
review_unconfirmed. Pierderea răspunsului după consum nu înseamnă lipsa efectului
SQL. Nu se retrimite automat și nu se generează bilet nou ca să ascundă incertitudinea.

## Probe locale și limite

7 teste Python trecute: parsare exactă și duplicate, framing/dimensiune/deadline,
verificarea UID-ului printr-un rezultat SO_PEERCRED simulat, refuz înainte de
citire/backend, pipe privat fără shell, erori fără secret și receipt fără autoritate
de execuție. Sintaxa bridge-ului Node verificată; audit 606 fișiere, zero constatări.

Mediul local este Windows: testul SO_PEERCRED este un mock, NU dovadă kernel Linux.
Nu există încă probă reală socket-activation, ACL Linux, peer refuzat în kernel,
LoadCredential pentru adaptor sau canal worker→adaptor→SQL pe VPS. Clientul worker
și unitățile systemd vor fi adăugate/probate separat, fără a instala prematur un
serviciu incomplet. KillMode/control-group și limitarea backlog-ului trebuie
fixate în unitățile viitoare; timeoutul procesului nu confirmă rollback SQL.

Nu se creează resurse tenant, nu se acordă granturi și nu se schimbă schema sau
serviciile existente de pe VPS. Schemele 010–012 rămân numai în workspace.
