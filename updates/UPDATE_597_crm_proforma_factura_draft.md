# UPDATE 597 — CRM Sprint 7: proformă și factură draft internă

Versiune: `2.12.577`  
Data: `2026-09-28`

## Ce aduce

- Proformă comercială creată din comanda client confirmată, cu snapshot și audit CRM.
- Factură de ieșire creată exclusiv ca **draft** în modulul existent Contabilitate.
- Legătura facturii păstrează comanda client, oferta sursă și revizia exactă.
- Protecție idempotentă: repetarea acțiunii nu emite încă o proformă sau o factură draft.

## Limite intenționate

- Nu se validează automat factura și nu se generează nota contabilă automat.
- Nu se transmite automat e-Factura.
- Oblio și SmartBill rămân providerii următori, implementați ulterior prin același port Billing.
- Pentru factura draft, clientul CRM trebuie să fie legat de un terț client activ în Contabilitate.
