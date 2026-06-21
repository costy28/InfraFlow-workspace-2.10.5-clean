# UPDATE 100 - Modaluri mobile Documente

Versiune: 2.12.79 -> 2.12.80
Data: 2026-06-21

## Modificari

- Am ajustat componenta globala `Modal` pentru ecrane inguste:
  - foloseste latimea disponibila pe mobil fara scroll orizontal;
  - ascunde manerul de redimensionare pe mobil;
  - pastreaza redimensionarea pe desktop.
- Am optimizat modalul `Document nou din template`:
  - formular pe o singura coloana pe mobil;
  - preview generat la cerere pe mobil;
  - butoane full-width pe telefon.
- Am optimizat editorul de template document:
  - selectorul de variabile nu mai forteaza latimea paginii;
  - butoanele din editor sunt usor de folosit pe mobil;
  - preview-ul template-ului are padding si inaltime adaptate pe telefon.

## Verificare recomandata

- Deschide `/documente` pe mobil.
- Intra pe `Template-uri` si verifica actiunile din carduri.
- Deschide `Document nou`, completeaza campurile, genereaza preview si creeaza documentul.
- Deschide `Template nou` si verifica upload/editare fara scroll orizontal.
