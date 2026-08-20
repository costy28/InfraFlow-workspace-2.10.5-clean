# Roadmap — integrare REGES-Online API

Data notării: `2026-08-20`
Sursă de referință: <https://github.com/reges-ro/integrare>

## Context

InfraFlow are deja export intern de lucru pentru REGES/Revisal, folosit pentru verificare operațională. Acesta nu este și nu trebuie prezentat ca fișier oficial de import.

Integrarea REGES-Online trebuie tratată separat, ca adaptor oficial configurabil pentru organizațiile din România, activ doar când clientul are acces API valid.

## Observații din documentația tehnică REGES

- API-ul REGES-Online este expus pentru aplicația angajatorului la `api.inspectiamuncii.ro`.
- Accesul la API se face cu token individualizat pe CUI/CIF, obținut din aplicația web a angajatorului.
- Mesajele pot fi transmise în XML sau JSON și trebuie să respecte schema REGES 2025 / XSD.
- Operațiunile sunt procesate în coadă FIFO.
- Transmiterea are două niveluri de răspuns:
  - răspuns sincron `MessageResponse`, cu identificator/recipisă de preluare;
  - rezultat asincron `MessageResult`, după procesarea efectivă.
- Mesajele acoperă salariați, contracte și acțiuni asociate contractelor: modificări, încetări, detașări, mutări etc.
- Pentru urmărire corectă, InfraFlow trebuie să păstreze ID-urile returnate și să le lege de angajat/contract.

## Direcție de implementare propusă

### 1. Fundație configurare

- Setări organizație pentru România:
  - activare adaptor REGES-Online;
  - CUI/CIF angajator;
  - token API securizat, neafișat după salvare;
  - mediu API: test/producție, dacă documentația oficială permite;
  - identificator aplicație client, versiune mesaj și utilizator raportor.
- Permisiune separată: `hr:reges_api_manage`.

### 2. Model de date

Tabele viitoare recomandate:

- `hr.reges_api_settings`
- `hr.reges_messages`
- `hr.reges_message_results`
- `hr.reges_entity_links`

Date obligatorii de păstrat:

- `message_id` intern;
- `response_id` / recipisă;
- `result_id`;
- tip operațiune;
- status: draft, validat local, trimis, acceptat sincron, procesat, respins, eroare;
- payload XML/JSON generat;
- erori de validare și răspunsuri brute;
- legătura cu `employee_id` și `contract_id`.

### 3. Generator mesaje

Generator separat de UI:

- salariat nou / modificare salariat;
- contract nou / modificare contract;
- încetare contract;
- suspendări și alte acțiuni asociate contractului;
- detașare / mutare, conform documentației oficiale.

Principiu: utilizatorul nu editează XML. InfraFlow generează mesajul din datele HR și afișează un preview lizibil.

### 4. Validare înainte de transmitere

- Validare locală obligatorie înainte de POST:
  - câmpuri HR lipsă;
  - contract fără număr/data contract/data start;
  - COR/normă/tip contract invalide;
  - lipsă identificatori REGES pentru operațiuni pe entități existente;
  - validare XSD/JSON schema, unde este posibil.
- Mesajele invalide rămân în draft cu listă clară de remedieri.

### 5. Transmitere și rezultate

- POST transmitere mesaj către API.
- Salvare răspuns sincron.
- Polling/manual refresh pentru rezultate asincrone.
- Asociere `MessageResult` cu angajatul și contractul.
- Timeline în fișa angajatului și în contract:
  - generat;
  - trimis;
  - preluat;
  - procesat cu succes;
  - respins, cu motiv.

### 6. UX recomandat

În HR:

- tab `REGES-Online`;
- panou `De transmis`;
- panou `În așteptare rezultat`;
- panou `Respinse / necesită corecție`;
- acțiune `Verifică și pregătește REGES`;
- acțiune `Trimite către REGES`, cu confirmare explicită.

În fișa angajatului:

- status REGES pe salariat;
- status REGES pe contract;
- istoric mesaje și recipise.

### 7. Riscuri / atenții

- Tokenul API este sensibil și trebuie criptat / protejat în storage.
- Implementarea trebuie făcută doar după confirmarea endpoint-urilor, autentificării și mediului oficial disponibil pentru test.
- Nu se activează implicit pentru organizații din afara României.
- Logurile nu trebuie să expună CNP, token sau payload complet către utilizatori fără permisiune.
- Orice respingere de la REGES trebuie păstrată exact pentru audit, dar afișată prietenos pentru operator.

## Poziționare produs

Această integrare poate deveni diferențiator major pentru modulul HR România: nu doar evidență internă, ci flux complet de pregătire, validare, transmitere și urmărire a răspunsurilor REGES-Online.
