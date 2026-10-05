# UPDATE 689 — Ajutor administrabil în aplicație

**Versiune:** v2.12.669  
**Data:** 5 octombrie 2026

## Ce aduce

- Pagina **Ajutor** devine o bază de cunoștințe scurtă și căutabilă, structurată pe categorii și pași numerotați.
- Orice utilizator autentificat poate consulta articolele publicate; editorul este disponibil exclusiv pentru rolul **Superadmin**.
- Superadminul poate crea, modifica, ordona, publica sau ascunde articole fără modificarea codului aplicației.
- Un articol poate include o captură PNG, JPG sau WEBP de maximum 3 MB și o explicație a elementelor din imagine.
- Imaginile nu sunt publice: se citesc numai prin API, după autentificare, iar operațiile de conținut și upload sunt păstrate în audit.

## Limite explicite

- Ajutorul folosește text simplu și pași numerotați, nu un editor de documente sau manuale PDF.
- Nu există încă versionare editorială, traducere automată sau publicare externă.
