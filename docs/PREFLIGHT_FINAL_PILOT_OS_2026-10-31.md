# Verificare finală înaintea primului cont OS pilot

Pachetul este numai pentru citire. Nu conține instalator sau comandă de creare.

## Linux

`sudo python3 scripts/linux/preflight-demo-os-pilot-final.py --check-only`

Verifică instrumentele prin `--help`, inventarul NSS absent și refuzul observatorului pentru identitate inexistentă, căile noi absente și unitățile de pilot absente. Nu citește parole. S-a executat cu succes în Ubuntu WSL local 24.04.5.

## SQL pe VPS

`preflight-demo-os-pilot-final.sql` cere baza `INFRAFLOW_DEMO_PLATFORM` și administrator pentru verificare. Folosiți sqlcmd cu parolă introdusă interactiv, niciodată `-P`.

Snapshot așteptat: job `00f612ed-a8ac-4688-a26f-679760eee0be`, queued, revizie 5, generație 2, execution_ready 0, fără lease. Trial queued revizie 1, neactivat; fără intenție OS și fără delegări/acceptări/rezultate. Migrările 014–017 prezente. Refuză orice abatere; nu încearcă reparații. Scriptul SQL nou trebuie încă validat pe snapshot-ul real al VPS-ului; nu este prezentat ca executat local.

Această citire este un snapshot, nu rezervare atomică; înaintea unei viitoare mutații rămân obligatorii verificările CAS/lease/context. Nici un marker de preflight nu constituie autorizație OS.

În caz de refuz, transmiteți markerul sau eroarea fără parole și fără reluarea operațiilor de creare. Prima creare reală necesită confirmare separată și un pachet de aplicare distinct. Activarea instanței și perioada de 15 zile nu fac parte din acest preflight.
