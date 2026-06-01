# UPDATE 020 — Foi Parcurs Digital Complet
Data: 01 Iunie 2026
Versiune: 2.12.0

## Descriere
Flux complet foi parcurs:
Responsabil trimite → Șofer completează verso pe telefon → Semnătură digitală șofer →
Link semnare responsabil (fără login) → PDF final cu semnături → Aprobare șef mecanizare.
Web Push Notifications pentru toate acțiunile.

## Baza de date
- Tabel nou: `core.push_subscriptions`
- Coloane noi: `fleet.trip_logs` (status flux, semnături, token public, aprobare, cale PDF final)

## Compatibilitate
- Endpointurile vechi de foi parcurs rămân disponibile pentru clienții existenți.
- Modulul push este încărcat defensiv: un update ZIP nu blochează pornirea serverului dacă dependența npm nu este încă instalată.
