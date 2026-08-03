# UPDATE 481 — Aplicare șabloane workflow la lansarea documentelor

Versiune: `2.12.461`  
Data: `2026-08-02`

## Scop

Legarea primului strat de workflow configurabil la comportamentul real al documentelor.

Șabloanele definite în `Setări > Module` nu mai sunt doar configurare pasivă: la lansarea unui document în circuit, aplicația încearcă să aplice șablonul activ potrivit tipului de document.

## Implementat

- La `launch` document:
  - se caută șablon activ în `settings.workflow_document_flows`;
  - potrivirea se face după tip document / id / denumire;
  - se construiește un snapshot al fluxului;
  - snapshot-ul este salvat în `date_json.workflow_snapshot`;
  - documentul păstrează `workflow_flow_id` și `workflow_flow_version`.
- Pașii de circuit se generează din snapshot când există șablon configurat.
- Dacă nu există șablon configurat potrivit, engine-ul păstrează comportamentul vechi.
- Rezolvarea responsabilului încearcă:
  - manager direct al inițiatorului;
  - utilizator nominal;
  - utilizator din departament;
  - utilizator cu rol compatibil.
- În MSSQL, pașii sunt inserați sigur cu `user_responsabil` când poate fi identificat; detaliile complete rămân în snapshot.
- În dosarul documentului, UI afișează:
  - fluxul aplicat;
  - versiunea;
  - data snapshot-ului;
  - lista pașilor configurați.

## De ce contează

Documentele lansate păstrează versiunea de flux de la momentul lansării. Dacă administratorul modifică ulterior șablonul, documentele deja pornite nu își schimbă retroactiv traseul.

## Limitări intenționate

- Nu schimbă încă tabela `documents.circuit_steps`.
- Nu adaugă încă editor de condiții avansate cu validare pe expresii.
- Nu implementează încă escaladări automate după termen.

## Următorul pas recomandat

Adăugarea unui panou de testare workflow în Setări: alegi tip document, valoare, departament și inițiator, iar aplicația îți arată ce pași se vor aplica înainte să salvezi/lasezi documentul.
