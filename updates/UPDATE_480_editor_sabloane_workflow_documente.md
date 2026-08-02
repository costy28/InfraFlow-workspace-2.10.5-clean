# UPDATE 480 — Editor simplu pentru șabloane de workflow documente

Versiune: `2.12.460`  
Data: `2026-08-02`

## Scop

Primul pas practic pentru workflow configurabil pe organizație și tip document.

În loc ca fluxurile să rămână doar direcție de produs, `Setări > Module` oferă acum un editor simplu pentru șabloane de flux.

## Implementat

- Editor vizual simplu în `Setări > Module` pentru:
  - Referat / necesar intern;
  - Contract;
  - Factură intrare;
  - Document HR.
- Administratorul poate modifica:
  - denumirea fluxului;
  - tipul documentului;
  - activ/inactiv;
  - versiunea;
  - numărul de zile pentru escaladare;
  - pașii fluxului;
  - tipul aprobatorului: rol, departament, utilizator sau manager direct;
  - referința aprobatorului;
  - termenul pasului;
  - condiția pasului;
  - dacă pasul este obligatoriu.
- Buton de reset local la șabloanele implicite.
- Buton de salvare persistentă a fluxurilor.
- Configurația se salvează în `settings.workflow_document_flows`.
- Backend-ul normalizează defensiv configurația salvată:
  - maximum 30 fluxuri;
  - maximum 20 pași per flux;
  - limite de lungime pentru câmpuri;
  - tipuri de aprobator controlate.

## Observații

- Update-ul nu schimbă încă engine-ul de aprobare existent.
- Documentele lansate nu sunt migrate automat pe noua structură.
- Următorul pas logic este legarea acestor șabloane la pornirea unui document nou, cu snapshot/versionare pe document.

## Verificare recomandată

1. Deschide `Setări > Module`.
2. Modifică un pas într-un flux.
3. Apasă `Salvează fluxurile`.
4. Reîncarcă pagina și verifică dacă modificarea rămâne.
5. Apasă `Resetează șabloane`, apoi salvează dacă vrei revenirea la implicit.
