# UPDATE 201 - Validare DUK SAF-T

Versiune: 2.12.181  
Data: 2026-07-01

## Modificari

- Namespace-ul de depunere D406 este separat de namespace-ul tehnic al schemei XSD ANAF.
- Identificatorii partenerilor respecta codificarea SAF-T (`00+CUI` pentru persoane juridice din Romania).
- Conturile analitice ale tertilor sunt normalizate la contul sintetic cerut de DUK.
- Unitatile uzuale sunt mapate la codurile UNECE (de exemplu `BUC` la `H87`).
- Platile folosesc codurile ANAF pentru metoda de plata si totaluri debit/credit.
- Sectiunile fara documente sunt omise, iar declaratia lunara nu raporteaza miscari de stoc.
- Raportul `.err.txt` al validatorului DUK este citit si afisat direct in Audit fiscal.
- Detectorul validatorului recunoaste si Java inclus local in folderul DUK.

## Verificari

- 72 teste contabile automate trecute.
- Build frontend Vite finalizat.
- Validare XSD ANAF v2.4.9 trecuta cu zero erori pe fixture complet.
- Validare DUK CLI reala executata cu pachetul ANAF din 16.02.2026.

## Observatie validator

Pachetul DUK testat local respinge codul oficial TVA 21% `310344`, desi nomenclatorul ANAF il marcheaza activ din 01.08.2025. InfraFlow pastreaza codul fiscal oficial si afiseaza respingerea exacta; nu substituie artificial codul vechi de 19%.
