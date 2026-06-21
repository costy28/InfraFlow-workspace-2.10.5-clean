# UPDATE 094 - Design Pass 2 modaluri

Versiune: 2.12.74
Data: 2026-06-21

## Modificari

- Modalurile FAZ utilaje folosesc componenta comuna `Modal`, inclusiv redimensionare si tema globala.
- Dialogurile din Setari pentru rol nou si stergere rol folosesc componenta comuna `Modal`.
- Dialogurile Kiosk pentru completare verso, activitati si semnatura folosesc componenta comuna `Modal`.
- Cardurile Kiosk si modalul local din Asternere respecta variabilele globale de colturi si umbre.
- Inputurile din dialogurile refactorizate au focus/hover coerent cu restul aplicatiei.

## Verificare

- `npm run build` in `client`
- `npm run check` in `server`
- ZIP update complet cu `client/dist`
