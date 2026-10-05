# UPDATE 683 — Dovadă de livrare Logistică (v2.12.663)

## Scop

Completează execuția unei curse prin confirmare de primire, dovezi de livrare
și istoric operațional, fără transmitere automată către sisteme externe.

## Ce este nou

- Confirmare de livrare cu persoana care a primit, dată/oră și observații;
  cursa este marcată controlat ca `Livrată`.
- Atașamente PDF, JPG, PNG sau WEBP de maximum 20 MB, stocate într-o zonă
  protejată și disponibile numai prin endpoint autorizat.
- Istoric pe cursă pentru creare, actualizare, alocare, documente de transport,
  confirmare, atașare și retragere logică a dovezilor.
- Un document de transport creat, actualizat sau anulat din cursă este inclus
  în istoricul acelei curse.

## Limită explicită

Modulul nu transmite automat documente, dovezi sau date către RO e-Transport,
ANAF, transportatori ori alte servicii externe. Eventualele obligații de
transport și declarare se verifică separat pentru jurisdicția aplicabilă.
