# UPDATE 686 — Monitorizare operațională Logistică (v2.12.666)

## Scop

Oferă operatorului o vedere scurtă asupra curselor care necesită verificare,
fără să automatizeze decizii sau comunicări externe.

## Ce este nou

- Panou compact pentru filtrele `Întârzieri` și `Sosiri neconfirmate`.
- Plecările și sosirile neînregistrate după ora planificată sunt semnalate în
  lista curselor.
- O cursă cu sosire efectivă și fără confirmare de primire/livrare este
  evidențiată separat.

## Limite explicite

- Semnalările sunt calculate la afișare din datele locale deja introduse.
- Nu trimit notificări, nu schimbă automat statusuri și nu creează task-uri.
- Nu folosesc GPS, foi de parcurs, e-Transport, ANAF sau servicii externe.
