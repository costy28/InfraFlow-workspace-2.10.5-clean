# Demo comercial InfraFlow (MSSQL separat)

Demo-ul comercial rulează pe aceeași arhitectură ca produsul: Node.js + MSSQL + migrări CRM. Nu folosește modul JSON al demo-ului vechi pentru CRM, deoarece acesta nu poate demonstra în mod corect auditul, ofertele versionate, comenzile și integrarea cu stocul.

## Siguranță

- Baza trebuie să poarte un nume de forma `INFRAFLOW_DEMO` sau `INFRAFLOW_DEMO_<SUFIX>`.
- Scriptul refuză orice alt nume și nu citește/scrie în baza configurată pentru instalarea curentă.
- Reinițializarea necesită explicit `--reset` sau `-Reset`.
- Toate organizațiile, persoanele, adresele și cifrele seed sunt fictive.
- SMTP nu este inclus în seed și parola de email nu se pune în cod, script sau Git.

## Pregătire locală

Într-un PowerShell nou, în folderul proiectului:

```powershell
$env:INFRAFLOW_DEMO_DATABASE = 'INFRAFLOW_DEMO'
.\scripts\windows\seed-commercial-demo-mssql.ps1
```

Scriptul creează baza dacă lipsește, aplică migrările și produce următoarele date:

- `Construct Demo SRL`;
- conturile existente de demo, plus `vanzari.demo`, `aprobare.demo`, `achizitii.demo` și `contabilitate.demo`;
- clienți/prospecte fictive, produse și furnizori din catalogul demo;
- un lead nou de calificat;
- o ofertă draft de modificat;
- o ofertă trimisă spre aprobare;
- o ofertă acceptată care a creat o comandă cu deficit de stoc, necesar de aprovizionare și proformă;
- auditul aferent acțiunilor demonstrative.

Pentru a reface exclusiv datele demo din aceeași bază:

```powershell
.\scripts\windows\seed-commercial-demo-mssql.ps1 -Reset
```

## Pornire

Într-un al doilea PowerShell, pornește demo-ul pe portul separat `4191`. Nu porni serviciul de producție cu `DB_DATABASE=INFRAFLOW_DEMO` dacă acesta deservește o instalație reală.

```powershell
.\scripts\windows\start-commercial-demo-mssql.ps1
```

Deschide apoi `http://localhost:4191/login`. Scriptul oprește scheduler-ul în demo și nu schimbă instanța de la `localhost:4180`. Opțional, poți alege altă bază demo/port:

```powershell
.\scripts\windows\start-commercial-demo-mssql.ps1 -Database INFRAFLOW_DEMO -Port 4192
```

Autentificare demo: `admin` / `demo123`. Utilizatorii comerciali suplimentari folosesc aceeași parolă demo.

Setările de server/creditele SQL rămân în runtime-ul local, nu în acest document sau în Git.

Dacă scriptul indică autentificare SQL eșuată, nu introduce parola în script: rulează-l în aceeași sesiune/configurație de runtime care pornește serverul demo sau configurează local conexiunea SQL Server pentru acea sesiune.

## Cele trei scenarii

1. **Flux simplu**: deschide lead-ul nou, califică-l, creează ofertă, aprob-o și trimite linkul securizat.
2. **Lipsă stoc**: deschide comanda deja creată din oferta acceptată, verifică snapshot-ul de stoc și necesarul pentru Achiziții. Stocul nu se rezervă automat.
3. **Managerial**: autentifică-te ca administrator sau aprobare demo pentru tabloul comercial, audit și următorii pași.

## SMTP de test

Adresa de demo se configurează local în Setări → Email. Pentru Gmail, folosește autentificare în doi pași și un App Password creat de proprietarul contului; nu transmite și nu salva acea parolă în chat, script sau repository. Înainte de trimitere, păstrează destinatarii la adrese controlate de echipă.
