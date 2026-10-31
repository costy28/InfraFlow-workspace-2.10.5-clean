# Laborator Linux local

Verificat local la 31 octombrie 2026, în continuarea pilotului demo.

- WSL2: distribuția `Ubuntu-24.04`, Ubuntu 24.04.5 LTS.
- PID 1: systemd; `systemctl is-system-running` a răspuns `running`.
- Python: `/usr/bin/python3`; Node nu a fost găsit în PATH.
- Sesiunea WSL curentă rulează root. Nu este dovadă că un serviciu restricționat poate accesa resursele.
- Docker Desktop este prezent pe disc, dar CLI `docker` nu este în PATH-ul PowerShell curent. Distribuția docker-desktop era oprită la inventar. Nu s-au schimbat setări Docker/WSL.

## Probe executate în Ubuntu local

17 teste Python trecute: observator 4, legături orchestrator 5, host port 3, transport IPC 5. Acestea folosesc porturi simulate, nu SQL real.

Probe kernel reale, fără conturi SQL/OS:

- lock concurent refuzat, eliberare pe același inode, symlink/hardlink refuzate;
- comandă benignă `/usr/bin/true` și timeout al arborelui propriu de procese;
- ambele probe au confirmat curățarea directoarelor temporare proprii din `/run`.

Nicio creare de utilizator/grup, citire de credentiale VPS, schimbare SQL sau repornire de servicii existente.

## Utilizare în continuare

Ubuntu WSL este laboratorul local disponibil pentru probe Linux și systemd; nu înlocuiește acceptanța pe VPS. Docker poate fi folosit ulterior pentru dependințe/medii temporare, fără schimbarea implicită a arhitecturii self-hosted. Instalarea Node, SQL sau a unor servicii noi în laborator va fi o etapă explicită; în acest increment nu s-au instalat pachete.

Codul este citit din `/mnt/e/CODEX 1/InfraFlow-workspace-2.10.5-clean`. Probe de ownership/permisiuni persistente nu trebuie considerate valide pe montarea Windows: folosiți directoare native Linux protejate, ca în canary-urile `/run` deja executate.
