# Pregătire probă Windows — identități și fișiere distincte

25 octombrie 2026. Nu este raport de izolare reușită și nu autorizează mutații.

## Stare verificată

`scripts/windows/check-demo-os-isolation.ps1` verifică read-only precondițiile.
Sesiunea actuală este pe 64 biți, cu LocalAccounts, icacls și lansare prin
Credential disponibile, dar **nu este elevată**. Nu s-au creat conturi, schimbat
ACL-uri sau cerut elevare automată. Prezența uneltelor nu demonstrează dreptul de
logon sub alte conturi ori aplicarea politicilor de securitate.

Comandă de verificare, fără modificări:

```powershell
pwsh -NoProfile -File "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean\scripts\windows\check-demo-os-isolation.ps1"
```

## Scope propus pentru autorizare separată

1. Două conturi locale temporare, cu prefix `IFISO` și sufix aleator, fără
   apartenență la Administrators și fără modificarea politicilor de logon.
2. Un director nou de test dedicat, cu manifest al căii absolute și SID-urilor
   efectiv create; niciun director sau fișier din instalarea InfraFlow.
3. Storage A/B, chei sintetice A/B, canari și backupuri fictive. Permisiuni
   administrative de cleanup păstrate; conturile runtime primesc numai accesul
   propriu. Cheia proprie este read-only, storage-ul propriu read/write.
4. Procese lansate sub identitățile reale A și B, cu verificarea SID-ului efectiv;
   nu două procese ale utilizatorului curent și nu doar inspecție de ACL.
5. Probe pozitive în domeniul propriu; refuz citire/scriere storage vecin,
   cheie vecin și backup; conținutul canarilor vecini comparat înainte/după.
6. Parole efemere generate local, fără argv, jurnal, fișiere de configurare sau
   expunere în raport. Nu se cere parola utilizatorului real.

Dacă politica OS blochează logon-ul procesului de test, proba este blocată,
nu se modifică politica de securitate pentru a o forța. Probe de traversal și
junction/symlink necesită și plan exact pentru target/cleanup; nu se afirmă că
sunt validate prin simple teste pe căi directe.

## Cleanup și limite

Se închid numai procesele create și identificate de fixture. Conturile se elimină
numai dacă SID-ul coincide cu manifestul; numele/prefixul singur nu este suficient.
Directorul se curăță numai după validarea căii absolute și verificarea reparse
points; nu se traversează legături către locații din afara fixture-ului. Nu se
folosesc wildcard-uri pentru ștergerea de conturi sau procese.

Întreruperea/cleanup-ul incomplet lasă un manifest fără secrete pentru diagnostic,
nu autorizează ștergere globală. Crearea profilurilor Windows și eventualele
artefacte de logon trebuie inventariate separat; nu promitem cleanup complet
al acestora fără verificare. Nu se modifică drepturile conturilor existente.

## Decizie necesară

Înainte de implementarea/rularea fixture-ului mutabil sunt necesare confirmarea
pentru cele două conturi, directorul și ACL-urile temporare cu cleanup strict,
precum și un context de execuție administrativ dedicat. Confirmarea probei SQL
anterioare nu este autorizare pentru conturi Windows sau politici OS.

Această probă nu validează izolarea Linux, runtime-ul ERP complet, gateway-ul
sau accesul la procese/secrete în toate scenariile. Nu există update de instalat.

## Script pregătit după confirmare

Utilizatorul a confirmat scope-ul. Scriptul mutabil este
`scripts/windows/test-demo-os-isolation.ps1`, cu opt-in `-RunIsolatedTest` și
refuz înainte de mutații dacă sesiunea nu este Administrator/64-bit. Folosește
un director nou `ProgramData\InfraFlow-Isolation-Test-<runId>` și conturi
`IFISO<10 caractere runId>A/B`, membre numai în grupul standard Users adăugat
de fixture, nu în Administrators. Verifică SID-ul efectiv al proceselor copil.

Ținta probei: 3 rezultate pozitive și 7 refuzuri per identitate (14 refuzuri
în total), cu chei și backupuri sintetice. Cleanup-ul privește obiectele create
și SID-urile înregistrate; directorul existent la coliziune nu este șters.
Fișierele cu rezultat conțin numai contoare și SID, nu parole. Nu se slăbesc
politicile OS și nu se folosesc parole în argumentele proceselor.

Comandă din PowerShell **Administrator**, după închiderea altor probe:

```powershell
pwsh -NoProfile -File "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean\scripts\windows\test-demo-os-isolation.ps1" -RunIsolatedTest
```

Acceptare numai dacă rezultatul final are `passed=true` și `cleanup=true` și
ambele identități au rezultatele așteptate. Dacă apare `profilesRemaining` sau
`cleanupIssues`, păstrăm directorul/manifestul pentru diagnostic și nu pretindem
curățare completă. Nu ștergem profile automat; nu rulăm cleanup global.

Verificat aici: sintaxa părintelui și copilului și refuzul fără Administrator,
înainte de modificări. **Execuția sub identități OS distincte NU a fost făcută**;
nu sunt probe ACL trecute. Audit expuneri 503 fișiere, zero constatări; diff check
trecut. Nu există update sau restart al aplicației.

### Prima rulare administrativă și corecție

Captura utilizatorului: runId `bba30810f6c24a99bfd26e144f3ac7cd`, eșec la
`create_account_A`, `ValidationMetadataException`, passed=false, cleanup=true,
fără profile restante sau cleanupIssues. Nu este o probă de izolare trecută.

Cauză identificată în metadata locală a cmdletului: Description are maximum
48 caractere, iar descrierea fixture-ului avea 70. Descrierea este acum `IFISO `
plus runId (38 caractere), cu verificare a limitei înainte de crearea directorului
sau conturilor. Verificarea de regresie a lungimilor și parserul au trecut;
nu s-au schimbat politici OS sau drepturi și nu s-a reluat automat proba elevată.
Se cere rerularea aceleiași comenzi în PowerShell Administrator.

### A doua rulare: conversia membrului grupului

Captura: runId `5cda1cf373eb4158a4e07d25e238100c`, passed=false,
cleanup=true, PSInvalidCastException în etapa largă create_account_A.
Reprodus local fără mutații: conversia obiectului SecurityIdentifier la tipul
parametrului Add-LocalGroupMember.Member (LocalPrincipal[]) produce aceeași
PSInvalidCastException; conversia șirului SID.Value reușește. Scriptul transmite
acum SID.Value. Etapele add_standard_group/prepare_acl sunt distincte, iar
diagnosticul include numai numele comenzii și numărul liniei, fără argumente.
Conversia corectată și parserele părinte/copil au trecut; execuția elevată
rămâne de rerulat, nu este declarată izolare validată prin aceste verificări.

### A treia rulare: lansarea sub credențiale

Captura: runId `30f81e06d4764d0f9f45d1d081852411`, launch_probe_A,
Start-Process linia 116, InvalidOperationException, cleanup=true și fără profile
restante. Probele copil nu au rulat. Serviciul seclogon a fost observat Running
în sesiunea de diagnostic; nu a fost pornit/configurat de agent.

Defect identificat: codul complet prin EncodedCommand depășea 4000 caractere,
fără a include preambulul; limita documentată CreateProcessWithLogonW este 1024.
Sursă: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithlogonw
Lungimea este un defect verificat al fixture-ului, nu dovadă suficientă că explică
singură excepția generică din captura utilizatorului.

Corecție: fișier probe-A/B.ps1 temporar admin-owned, read/execute doar pentru
identitatea de test corespunzătoare, comandă -File scurtă și guard sub 1024.
Fără modificare ExecutionPolicy sau politici logon. Raportul include acum errorId,
HRESULT și launchLength, fără argumente/parole. Parser părinte/copil trecut;
execuția sub credențiale rămâne nevalidată până la rezultatul rerulării elevate.

### Rulare cu profil restant — oprire pentru diagnostic

Captura utilizatorului: runId `88bca974603c41b58018efb87872b40e`,
launch_probe_A, child_probe_failed, launchLength=340, passed=false,
**cleanup=false**, profile_requires_review. SID restant raportat:
`S-1-5-21-3984578373-765403670-1964671013-1014`.
Nu se repetă fixture-ul și nu se șterge profilul/directorul automat. Agentul
neelevat nu poate citi manifestul protejat; accesul a fost refuzat. Este necesară
citirea administrativă a rezultatului copilului și a stării exacte a profilului.
Nu s-a determinat încă dacă proba a eșuat în execuție ori la validarea ieșirii;
child_probe_failed singur nu dovedește o problemă de ACL sau politică.

Captura de diagnostic ulterioară confirmă manifestul aceleiași rulări, lipsa
`A/result/result.json` și profilul SID -1014 cu Loaded=false, Special=false,
LocalPath=`C:\Users\IFISO88bca97460A`. Profilul nu a fost șters. Lipsa rezultatului
nu stabilește cauza; nu se afirmă că ExecutionPolicy este vinovată.
Scriptul pregătit pentru o eventuală rerulare capturează acum stdout/stderr în
directorul protejat al fixture-ului și raportează codul de ieșire și o categorie
fixă, fără output brut/secrete. Nu s-a făcut o nouă rulare sau o ștergere. Este
necesară confirmarea distinctă pentru curățarea profilului temporar verificat,
înainte de altă probă. Nu se modifică politici Windows.

### Curățare specifică autorizată, pregătită pentru Administrator

Confirmare primită pentru profilul A și directorul rulării `88bca974...`.
`scripts/windows/cleanup-demo-os-run-88bca974.ps1` este legat strict de runId,
cale, nume și SID-urile din captura manifestului. Verifică absența conturilor,
absența profilului B, profil A neîncărcat/nespecial și calea exactă. Fișierele
fixture-ului sunt inspectate fără traversarea reparse points înainte de ștergere.
Profilul este eliminat prin Win32_UserProfile/Remove-CimInstance, nu prin ștergere
manuală a registry-ului. Dacă Windows lasă profilul/calea, directorul testului
nu este eliminat. Nu se face cleanup global și nu se încearcă elevare automată.

Referințe Microsoft pentru modelul de profil și cmdletul CIM:
https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/ee886409(v=vs.85)
https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/remove-ciminstance
Verificat local: parser și refuz fără Administrator înainte de mutații. Curățarea
efectivă rămâne de confirmat din rezultatul execuției administrative a utilizatorului.

### Rulare bf72eaf2: blocaj ExecutionPolicy confirmat

Captura arată runId `bf72eaf206b848788329d4461a4eeb66`, childExitCode=1,
script_start_security_error, cleanup=false și profilul A restant SID -1016.
Citirea stderr de către utilizator confirmă explicit: probe-A.ps1 nu poate fi
încărcat deoarece rularea scripturilor este dezactivată. Manifestul confirmă
IFISObf72eaf206A/B cu SID -1016/-1017. Probele ACL nu au rulat.

Conform planului, testul este blocat de politica mediului; nu modificăm
ExecutionPolicy, nu adăugăm Bypass și nu încercăm altă lansare care ocolește
politica. Nu se rerulează fixture-ul până la rezolvarea curățării.

Confirmare primită pentru curățarea profilului A și directorului acestei rulări.
Script dedicat: `scripts/windows/cleanup-demo-os-run-bf72eaf2.ps1`, aceleași
verificări stricte ca pentru rularea precedentă, dar legate de noile nume/SID/căi.
Parserul și refuzul fără Administrator au fost verificate. Curățarea efectivă
rămâne în așteptarea rezultatului utilizatorului; nu se declară cleanup reușit.

Rezultat primit ulterior pentru runId bf72eaf206b848788329d4461a4eeb66:
profileRemoved=true, directoryRemoved=true, cleanup=true, stage=completed,
error/errorId=null. Curățarea acestei rulări este confirmată din captura
utilizatorului. Proba OS rămâne blocată de ExecutionPolicy, nu trecută; nu se
modifică politica și nu se repetă fixture-ul implicit. Continuarea dezvoltării
merge pe celelalte componente, fără a ascunde această poartă deschisă.
