# UPDATE 690 — Transfer biblioteca Ajutor între instalații

**Versiune:** v2.12.670  
**Data:** 5 octombrie 2026

## Ce aduce

- Acțiunea **Articol nou** este afișată corect pentru Superadmin în pagina Ajutor.
- Superadminul poate exporta biblioteca Ajutor din Demo ca arhivă ZIP, cu articolele și capturile atașate.
- În instalația client, Superadminul importă aceeași arhivă din Ajutor → **Importă Ajutor**.
- Importul înlocuiește conținutul local numai după confirmare explicită și lasă audit pentru export și import.

## Limite explicite

- Transferul este manual și controlat; Demo nu modifică automat datele unei instalații client.
- Importul înlocuiește biblioteca Ajutor locală. Înainte de import, exportă conținutul clientului dacă dorești să îl păstrezi.
