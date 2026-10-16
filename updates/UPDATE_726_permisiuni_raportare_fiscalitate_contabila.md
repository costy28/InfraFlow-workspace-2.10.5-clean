# UPDATE 726 — Permisiuni granulare pentru raportare și fiscalitate contabilă

Versiune: **2.12.706**  
Data: **15 octombrie 2026**

## Modificări

- Situațiile financiare permit consultarea și exportul fără a expune administrarea profilurilor și mapărilor.
- Registrul jurnal separă postarea notelor prin `accounting:post` de exporturile și rapoartele protejate prin `accounting:reports`.
- Formularele D205 și Intrastat, rulările de audit fiscal, generarea SAF-T și operațiile asupra declarațiilor cer `accounting:post`.
- Încărcarea și versionarea schemelor fiscale oficiale cer `accounting:manage`.
- Marcarea TVA ca verificat cere `accounting:close`.
- Descărcarea permisă pentru raportare nu mai încearcă să scrie în registrul fiscal când utilizatorul nu are drept de postare.

## Compatibilitate

- Nu se schimbă schema bazei de date, formulele contabile sau documentele existente.
- Rolurile contabile complete își păstrează fluxul actual.
- Rolurile de consultare văd datele și exporturile permise, fără controale care produc mutații.

## Verificări

- test UI dedicat pentru raportare și fiscalitate contabilă;
- regresii de permisiuni;
- regresie contabilă completă;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
