# Update 610 — Demo comercial pe roluri (v2.12.590)

## Ce se schimbă

- Acțiunile CRM din fișa ofertei sunt condiționate și în interfață de permisiunile deja aplicate de server.
- Rolul Contabilitate poate asocia terțul contabil unei comenzi client printr-o acțiune separată, validată și auditată.

## Efect în demo

- Vânzări lucrează cu lead-uri, oferte și transmitere.
- Aprobare vede și decide ofertele aflate în aprobare.
- Achiziții verifică stocul și creează necesarul.
- Contabilitate pregătește proforma/factura draft și selectează terțul contabil.

## Verificare

- Nu se modifică automat nicio comandă, factură sau configurare SMTP.
- După aplicare/restart, testați Contabilitate pe comanda demo: selectare terț → proformă sau factură draft.
