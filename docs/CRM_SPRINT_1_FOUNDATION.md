# CRM / Sales Automation — Sprint 1: fundație tehnică

Versiune: `v2.12.561`  
Status: fundație livrată; fără operațiuni comerciale active.

## Delimitare

Sprintul 1 adaugă doar infrastructura relațională pentru CRM. Nu introduce UI pentru lead-uri, oferte, acceptare publică, comenzi sau facturare și nu modifică datele existente din Gestiune, Achiziții, Contabilitate, Documente, Task-uri ori Workflow.

CRM este activabil ca modul separat (`crm`) în Setări → Module. Dacă este oprit, endpointul de sănătate răspunde controlat. În `DB_MODE=json`, CRM nu creează o copie paralelă în `app_state`; implementarea operațională necesită MSSQL relațional.

## Schema

Migrarea `070_crm_sales_automation_foundation.sql` creează schema `crm`: `accounts`, `contacts`, `leads`, `activities`, `quotes`, `quote_lines`, `quote_public_links`, `quote_decisions`, `customer_orders`, `customer_order_lines`, `inventory_checks`, `billing_documents`, `integration_events`.

Toate tabelele au UUID unic, trasabilitate de creare/modificare și anulare logică (`cancelled_at`, `cancelled_by`, `cancelled_reason`). O comandă păstrează sursa ofertei și liniile-snapshot; indexul unic filtrat pentru `source_quote_id` permite conversie idempotentă, fără a bloca viitoare comenzi create manual.

`crm.accounts.accounting_third_party_id` este deliberat o referință opțională, fără FK: registrul terților existent rămâne momentan sincronizat hibrid. CRM nu copie automat terți contabili și nu devine proprietarul documentelor contabile.

## Integrare modulară

Contractele declarate în `server/modules/crm/ports/` sunt pentru Inventory, Procurement, Accounting, Documents, Tasks, Workflow și Billing. Ele sunt stubs controlate în Sprintul 1, astfel încât nu există dependențe circulare.

`BillingProvider` definește punctele de extensie `validateConnection`, `createProforma`, `createInvoice` și `getDocumentStatus`. Nu există implementare Oblio sau SmartBill în acest sprint.

## Permisiuni și endpoint

Sunt disponibile cele 12 permisiuni granularizate `crm:*`. Rolurile existente nu primesc automat un rol comercial nou; administratorii configurează explicit accesul prin mecanismul de roluri deja existent.

`GET /api/crm/health` necesită `crm:view` și raportează activarea modulului, modul bazei de date, prezența tabelelor CRM și următorul pas. Nu există CRUD.

## Următorul sprint recomandat

Repository MSSQL pentru `accounts`, `contacts` și `leads`, cu audit `addAudit()`, anulare logică și teste de integrare. Ofertele și comenzile rămân sprinturi separate după validarea acestui nucleu.
