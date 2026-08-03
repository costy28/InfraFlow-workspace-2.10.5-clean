# UPDATE 486 — Diagnostic vizual pentru workflow configurabil

Versiune: `2.12.466`
Data: `2026-08-03`

## Ce s-a schimbat

- În `Setări > Module`, zona de workflow documente primește un panou de diagnostic read-only.
- Panoul grupează problemele în:
  - critice;
  - avertizări;
  - informative.
- Sunt detectate automat situații precum:
  - flux activ fără pași;
  - tip document lipsă;
  - tip document duplicat pe fluxuri active;
  - pași fără nume;
  - aprobator incomplet pentru rol, departament sau utilizator nominal;
  - termen invalid;
  - reguli structurate cu valoare lipsă;
  - condiții text libere care nu pot fi evaluate automat.

## De ce contează

Administratorul vede problemele înainte să folosească fluxurile pe documente reale. Asta reduce situațiile în care un document pleacă pe un traseu neclar sau ajunge la un aprobator incomplet configurat.

## Compatibilitate

- Nu schimbă schema bazei de date.
- Nu schimbă engine-ul real de workflow.
- Nu salvează nimic automat.
- Funcționează peste configurația existentă `settings.workflow_document_flows`.

## Verificare recomandată

1. Intră în `Setări > Module`.
2. Verifică panoul `Diagnostic workflow`.
3. Lasă intenționat un flux activ fără pași sau un pas fără aprobator și confirmă că apare avertizarea.
4. Corectează problema și confirmă că diagnosticul se actualizează automat.
