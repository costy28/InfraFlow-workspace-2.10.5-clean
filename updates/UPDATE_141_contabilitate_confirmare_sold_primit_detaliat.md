# UPDATE 141 - Contabilitate: confirmare sold primit detaliat

Versiune: 2.12.120 -> 2.12.121
Data: 2026-06-24

## Schimbari

- Marcarea unei confirmari de sold ca primita deschide un formular dedicat.
- Formularul permite completarea soldului confirmat de tert si a observatiilor.
- Aplicatia calculeaza diferenta fata de soldul din evidenta inainte de salvare.
- Diferenta si observatiile sunt pastrate in registrul confirmarilor de sold.

## Verificare

- `npm run build` in `client`
- `npm run check` in `server`
