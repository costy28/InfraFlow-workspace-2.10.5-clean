# UPDATE 680 — Logistică & Transport (v2.12.660)

## Ce aduce

- Modul activabil pentru avize de însoțire, CMR, bonuri de transport și dovezi de livrare.
- Documentele au număr intern, poziții, traseu, transportator, vehicul, șofer și referință externă opțională.
- Legături manuale, auditate, la o comandă de aprovizionare și/sau un contract existent.
- Tipărire HTML pregătită pentru salvare PDF și anulare controlată fără ștergerea istoricului.

## Limită explicită

- Nu transmite și nu declară nimic către RO e-Transport, ANAF sau alt serviciu extern.
- Codul NC este numai câmp opțional de document; nu există nomenclator fiscal sau validare de declarație în acest update.
- Obligațiile de transport, fiscalitate și raportare se verifică separat pentru jurisdicția organizației.

## Verificare după instalare

1. Activează `Logistică & transport` din Setări → Administrare module, dacă organizația nu are pachetul Enterprise/Demo complet.
2. Deschide Logistică & Transport și creează un aviz de test.
3. Leagă opțional o comandă sau un contract, apoi tipărește documentul.
4. Confirmă că nu este afișat niciun mesaj de transmitere automată către e-Transport/ANAF.
