# Decizii tehnice InfraFlow 1.0

## Tehnologie initiala

Pentru etapa 1.0 pastram directia compatibila cu ce exista deja:

- Node.js pentru API;
- SQL Server pentru baza locala Windows;
- frontend web in client WebView2;
- PowerShell pentru instalare si mentenanta Windows.

Nu trecem acum la Laravel/MySQL. Specificatiile externe raman utile ca model de
ERP, dar implementarea se face pe tehnologia pe care o putem livra si testa rapid
in reteaua clientului.

## Executabile

Executabilele se reconstruiesc doar cand se schimba:

- codul launcherului;
- codul installerului;
- iconul inglobat;
- logica de shortcut;
- logica de pornire standalone.

Schimbarile de API, SQL, CSS, frontend si documentatie nu cer rebuild automat.

## Compatibilitate istorică

Datele istorice si instalările vechi rămân compatibile până când:

- migratorul este testat;
- schema 1.0 este stabila;
- rapoartele principale dau aceleasi totaluri;
- clientul standalone porneste corect pe statie;
- updateul este verificat pe o copie.

Direcția curentă de produs este comercială și modulară, fără dependență de un client pilot activ.

## Licentiere

Licenta 1.0 trebuie sa contina:

- firma;
- cod client;
- module active;
- numar maxim utilizatori;
- numar maxim statii;
- data expirare/trial;
- semnatura digitala.

## Modul custom

Modulele custom pot exista, dar numai cu sabloane controlate:

- campuri tipizate;
- statusuri;
- permisiuni;
- export;
- raport print/PDF;
- audit;
- migrare SQL documentata.
