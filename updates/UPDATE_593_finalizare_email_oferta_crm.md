# InfraFlow v2.12.573 - Hotfix finalizare email ofertă CRM

## Ce rezolvă

- Activitatea CRM creată după expedierea unei oferte prin email primește `occurred_at`, moment obligatoriu în schema MSSQL.
- Trimiterea nu mai întoarce eroare după expedierea SMTP din cauza unei activități fără dată.
- Înregistrarea din Inbox ERP, activitatea CRM și auditul se finalizează pentru oferta și revizia trimise.

## Fără efecte la instalare

- Update-ul nu expediază emailuri, nu creează linkuri și nu schimbă statusurile ofertelor existente.

## Verificări

- Teste CRM fundație, Sprint 2, Sprint 3 și Sprint 4.
- Validare sintactică pentru ruta CRM.
- Verificare read-only a statusurilor ofertelor testate pe MSSQL.
