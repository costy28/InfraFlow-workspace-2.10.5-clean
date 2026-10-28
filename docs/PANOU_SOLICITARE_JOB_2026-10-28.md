# Panou operator — solicitare job, implementare locală

## Comportament

- Buton Pregătește demo numai când sesiunea are trial:prepare, runtime-ul este
  configurat și compania este queued cu revizia 0 în această primă etapă.
- Formularul arată denumirea, UUID-ul, revizia așteptată și commandId generat;
  checkbox-ul explică faptul că nu se creează instanța/baza și nu încep cele 15 zile.
- POST /operator/trials/prepare cere origin/proxy/cookie/CSRF, confirmare și
  autorizare trial.prepare, apoi trial.read după operație. Actorul nu vine din browser.
- Scope-ul efectiv este recitit de autentificare și de procedura SQL.
- Rezultatul poate fi neconfirmat după commit. Nu există retry automat; acțiunea
  Reia explicit aceeași solicitare păstrează exact UUID, revizie și commandId.
- Închiderea paginii cu rezultat incert produce avertizare. Datele comenzii rămân
  numai în memoria paginii; operatorul este instruit să noteze identificatorii pentru
  reconciliere. Nu se stochează tokenuri sau credențiale în local/sessionStorage.
- Un job confirmat produce mesajul cu jobId și execuție neactivată. Lista se reîncarcă;
  compania rămâne queued, revizia incrementată, fără al doilea buton eligibil.

## Integrare serviciu

INFRAFLOW_DEMO_PLATFORM_PREPARER=1 este opt-in separat și necesită operator HTTP
configurat. Runtime-ul citește preparer-password prin LoadCredential. Fără flag,
client și coordonator, ruta nu este montată și canPrepare nu este expus ca true.
/health/preparer verifică numai drepturile; nu creează joburi. Shutdown închide
și clientul preparer. /health/ready rămâne 503: platforma nu este public-ready.

## Validare și limite

Teste HTTP cu ascultător local: metodă, origin, CSRF, scope, confirmare, actor
injectat refuzat, revocare după rezultat și retry incert fără dublare.
Chrome headless: autentificare reală pe fixture, reload, înregistrare și pregătire
cu răspuns pierdut simulat după commit, aceeași comandă la retry, logout, XSS refuzat
prin textContent și afișare mobilă. Nu este o probă TLS/Cloudflare sau SQL nativ în browser.

Probele SQL native anterioare verifică separat tranzacțiile și drepturile identității.
Acceptanța HTTP→SQL nativ și HTTPS pe VPS trebuie făcută după instalarea controlată.
Nu s-a instalat acest increment pe VPS și nu s-a creat jobul companiei de test.
Instalatorul cu drop-in/rollback și confirmare separată a restartului este pasul următor.
