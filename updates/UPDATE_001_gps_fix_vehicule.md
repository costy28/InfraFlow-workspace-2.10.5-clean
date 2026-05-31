# UPDATE 001 — GPS Live fix vehicule

**Data:** 29 Mai 2026  
**Versiune:** 2.10.2  
**Autor:** InfraSuite

---

## Problema

GPS Live afișa „0 vehicule" deși conexiunea era configurată și autentificarea la urmariregps.ro reușea.

**Simptome:**
- Harta Leaflet se încărca corect (locație Piatra Neamț vizibilă)
- Polling la 30s funcționa dar returna mereu array gol
- Butonul „Testează GPS" raporta login reușit

---

## Cauze identificate

1. **Logging insuficient** — nu se vedea ce răspuns brut trimite urmariregps.ro
2. **Parser limitat** — nu acoperea formatul real al răspunsului (structura exactă necunoscută fără raw response)
3. **Sesiune PHP expirată** — re-loginul automat nu funcționa corect când sesiunea expira în mijlocul unui fetch
4. **`gps_user_id` hardcodat** — se trimitea `user=120` în toate request-urile, indiferent de configurație
5. **Nicio cale de investigare** — nu exista endpoint raw care să arate exact ce returnează API-ul GPS

---

## Fișiere modificate

| Fișier | Modificare |
|--------|-----------|
| `server/modules/integration/gps/routes.js` | Rescris complet |
| `client/src/pages/SetariPage.jsx` | Buton „Raw Response GPS" |
| `version.json` | 2.10.1 → 2.10.2 |

---

## Fix-uri aplicate

### 1. Logging detaliat complet
Fiecare request la urmariregps.ro loghează:
```
[GPS LOGIN] Încerc login cu user: user@example.ro
[GPS LOGIN] HTTP status: 200
[GPS LOGIN] Headers set-cookie: PHPSESSID=abc123; path=/
[GPS FETCH] Încerc: actiune="pozitii_vehicule" user="120"
[GPS FETCH] HTTP 200, 1847 chars, start: "<markers><marker id=..."
[GPS FETCH] Vehicule parsate: 12
[GPS FETCH] ✅ Succes! actiune="pozitii_vehicule" user="120" → 12 vehicule
```

### 2. Endpoint nou: `GET /api/integration/gps/raw`
Returnează răspunsul **brut complet** de la urmariregps.ro:
```json
{
  "actiune": "pozitii_vehicule",
  "http_status": 200,
  "raw_length": 1847,
  "tip_raspuns": "XML",
  "vehicule_parsate": 12,
  "raw_body": "<markers>...</markers>"
}
```
Parametri: `?actiune=pozitii_vehicule&user=120`

### 3. Parser XML îmbunătățit
- Caută recursiv tagul vehiculelor în orice structură XML
- Candidați: `marker, vehicle, car, vehicul, utilaj, auto, item, row`
- Fallback regex pe orice tag cu atribute `lat`/`lng`
- Logare: afișează primul element brut pentru diagnoză

### 4. Parser JSON îmbunătățit (5 formate)
- Format arrays paralele `numar/la_al/lo_al` (urmariregps.ro specific)
- Array direct `[{...}]`
- Proprietate standard: `markers, vehicule, vehicles, data, items, pozitii`
- Dicționar `{"NT-01": {lat,lng}, "NT-02": {lat,lng}}`
- Autodetecție orice cheie cu obiecte ce au coordonate

### 5. Re-login automat îmbunătățit
- Detectează răspuns HTML (pagina de login = sesiune expirată)
- Re-loginul se face automat și imediat, fără a returna 0 vehicule
- Extrage PHPSESSID și din body JSON / text simplu (nu doar din header)

### 6. Acțiuni GPS extinse
Acum testează 12 acțiuni în ordine:
`pozitii_vehicule, incarca_pozitii, get_vehicles, live_map, incarca_grupuri, vehicles_position, get_positions, pozitii, getMarkers, refresh, get_all_vehicles, get_pozitii`

---

## Cum testezi după update

1. **Repornire server**
2. **Deschide GPS Live** → verifică consolă server pentru log-uri `[GPS LOGIN]` și `[GPS FETCH]`
3. **Dacă 0 vehicule** → click „📋 Raw Response GPS" în Setări → General → GPS
   - Se afișează în consolă browser (F12) răspunsul brut
   - Identifică structura reală și ajustează parserul

---

## Cum investighez raw response-ul manual

```
GET /api/integration/gps/raw?actiune=pozitii_vehicule
GET /api/integration/gps/raw?actiune=incarca_pozitii&user=120
GET /api/integration/gps/debug   (superadmin only — testează toate acțiunile)
```
