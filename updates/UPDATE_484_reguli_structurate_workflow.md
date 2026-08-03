# UPDATE 484 — Reguli workflow structurate în configurație

Versiune: `2.12.464`  
Data: `2026-08-03`

## Scop

Să păstrăm condițiile workflow în două forme:

- text lizibil pentru utilizator;
- structură tehnică pregătită pentru evaluare reală în engine.

## Implementat

- Builder-ul de condiții din `Setări > Module` salvează acum și:
  - `condition_rule.field`;
  - `condition_rule.operator`;
  - `condition_rule.value`.
- Preset-urile rapide salvează și regula structurată aferentă.
- Condițiile scrise manual rămân text liber și sunt marcate fără regulă structurată.
- Pașii workflow nou adăugați primesc regula structurată implicită `always`.
- Frontend-ul normalizează compatibil configurațiile vechi, fără `condition_rule`.
- Serverul normalizează defensiv `condition_rule` la salvarea setărilor:
  - câmpuri permise: `always`, `estimated_value`, `department`, `priority`, `country`, `cost_center`, `source`;
  - operatori permiși: `=`, `!=`, `>`, `>=`, `<`, `<=`, `contains`;
  - valoarea este limitată la 120 caractere.
- Snapshot-ul workflow salvat pe document la lansarea în circuit include acum și `condition_rule`.

## Compatibilitate

- Nu adaugă tabele.
- Nu schimbă endpoint-uri.
- Nu schimbă încă logica de aplicare a pașilor.
- Condițiile text existente rămân valide.
- Documentele lansate după acest update păstrează regula structurată în snapshot când aceasta există.

## De ce contează

Acesta este podul dintre configurare vizuală și engine real. Utilizatorul vede în continuare o frază simplă, iar aplicația începe să aibă datele necesare pentru a decide automat dacă un pas se aplică sau nu.

## Următorul pas recomandat

Evaluator safe pentru `condition_rule`, folosit inițial doar în simulatorul din Setări, apoi în engine-ul de lansare documente după validare.
