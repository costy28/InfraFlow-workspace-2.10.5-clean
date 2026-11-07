# Verificare negativă prin brokerul executorului

Pachet privat, fără modificarea versiunii ERP.

Preflight-ul compară cele cinci fișiere instalate ale brokerului cu sursele incluse, verifică metadatele jurnalului și absența unității temporare. Nu citește tokenul și nu apelează SQL.

Modul confirmat citește jurnalul privat al ciclului pilot, verifică finalizarea `released` și legăturile fixe ale încercării din generația 4/revizia 8. Inițializează brokerul existent, verifică drepturile prin metadate și trimite exact o cerere `context` cu tokenul protejat. Nu apelează `report`, claim, prepare, release sau operații OS.

Succesul cere un răspuns explicit de refuz al brokerului; o eroare simplă de transport nu este succes. Refuzul este generic și nu dovedește singur motivul exact SQL. Proba nu validează calea pozitivă sau trimiterea reală a unui raport.

Nu este creată o unitate permanentă și nu se repornesc serviciile existente. Se folosește unitatea temporară dedicată executorului; închiderea respectă identitatea invocării. La rezultat neconfirmat se oprește, fără retry automat și fără ștergerea resurselor existente.
