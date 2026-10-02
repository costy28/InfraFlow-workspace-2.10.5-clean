# Catalog central de update-uri InfraFlow

## Decizia de produs

Toate instanțele InfraFlow citesc aceeași sursă centrală de release-uri. Nu există un catalog diferit pentru fiecare client. Există însă artefacte distincte pentru platformă și componente distincte pentru Core sau module.

- `Core` se aplică tuturor instanțelor eligibile.
- O componentă de modul se arată și se poate instala numai dacă licența locală permite modulul respectiv.
- Un pachet poate conține cod pentru mai multe module, dar accesul este decis server-side prin licență și permisiuni; nu ne bazăm pe ascunderea din interfață.
- Actualizarea manuală deja existentă rămâne disponibilă ca fallback verificat.

## Două niveluri de manifest

1. **Catalogul central semnat** spune ce versiuni și artefacte sunt publicate pentru canalul `stable`.
2. **Manifestul de integritate al pachetului** verifică fișierele din arhiva descărcată înainte de instalare.

Catalogul nu conține parole, chei private, tokenuri de licență sau date de client. Descărcarea autenticată va folosi ulterior un token de instalare cu expirare scurtă, nu `licenseId` pus în URL.

## Contractul catalogului

Fișierul static se servește prin HTTPS, de exemplu:

`https://updates.infraflow.ro/catalog/stable.json`

Documentul exterior are forma:

```json
{
  "format": "infraflow-release-catalog-v1",
  "payload": "payload JSON codificat base64url",
  "signature": "semnătură Ed25519 base64url"
}
```

Payload-ul semnat conține `generated_at` și `releases`. O versiune are `version`, `channel`, `notes`, `mandatory` și `components`. Fiecare componentă publică numai artefactele HTTPS compatibile cu `server-linux` sau `server-windows`, împreună cu SHA-256.

Exemplu conceptual de payload:

```json
{
  "format": "infraflow-release-catalog-v1",
  "generated_at": "2026-10-01T10:00:00.000Z",
  "releases": [{
    "version": "2.12.700",
    "channel": "stable",
    "mandatory": { "mode": "required", "after": "2026-11-01T00:00:00Z", "reason": "core-security" },
    "components": [{
      "id": "core",
      "type": "core",
      "artifacts": {
        "server-linux": { "url": "https://updates.infraflow.ro/packages/2.12.700/InfraFlow-update-v2.12.700-linux.tar.gz", "sha256": "...64 caractere..." }
      }
    }, {
      "id": "module:hr",
      "type": "module",
      "modules": ["hr"],
      "artifacts": {
        "server-linux": { "url": "https://updates.infraflow.ro/packages/2.12.700/InfraFlow-hr-v2.12.700-linux.tar.gz", "sha256": "...64 caractere..." }
      }
    }]
  }]
}
```

## Aplicare după tipul clientului

| Model | Cine decide momentul | Update Core critic | Update modul licențiat |
| --- | --- | --- | --- |
| Managed InfraFlow | Noi, într-o fereastră comunicată | Poate deveni obligatoriu la data din catalog | Doar dacă modulul este activ în licență |
| Self-hosted | Administratorul clientului | Catalogul avertizează/blochează conform contractului; instalarea este confirmată local | Doar dacă modulul este activ în licență |

Expirarea suportului nu șterge și nu oprește versiunea deja instalată la un client self-hosted. Ea oprește accesul la release-uri noi și suport, conform contractului comercial.

## Configurare viitoare pe instanță

Instanța va primi numai două valori operaționale, în variabile de mediu:

- `INFRAFLOW_UPDATE_CATALOG_URL` — URL-ul HTTPS al catalogului stabil;
- `INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY` — cheia publică Ed25519 a catalogului, fără cheia privată.

Fără ambele valori, catalogul central rămâne neconfigurat și aplicația continuă să permită update-ul manual actual. Nu se acceptă catalog nesemnat.

## Serviciul central de distribuție

Prima implementare a serviciului este în `update-service/app.js` și rulează izolat ca `infraflow-updates.service`. El expune numai:

- `GET /health`;
- `GET /catalog/stable.json`;
- `GET /packages/<versiune>/<arhivă>`.

Arhivele pot fi protejate cu un token trimis exclusiv în headerul `Authorization`; catalogul nu include tokenul. Instalarea și configurarea Tunnel sunt documentate în `docs/INSTALARE_SERVICIU_ACTUALIZARI.md`.

## Ce urmează înainte de activarea reală

1. Publicare internă controlată a catalogului semnat și a arhivelor verificate.
2. Endpoint de descărcare cu ticket temporar per licență, înlocuind tokenul comun de tranziție.
3. Descărcare, verificare SHA-256 și predare către updaterul local pentru Windows și Linux.
4. Panou Update: versiune disponibilă, componente eligibile, motiv obligatoriu și fereastra de instalare.
5. Jurnal central de livrare, fără a copia datele operaționale ale clienților.
