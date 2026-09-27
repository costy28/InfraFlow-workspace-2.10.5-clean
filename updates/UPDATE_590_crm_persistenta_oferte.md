# InfraFlow v2.12.570 - Hotfix persistență Oferte CRM

Data: 27 septembrie 2026

## Ce repară

- Lista **CRM / Vânzări → Oferte comerciale** arată din nou drafturile și ofertele trimise spre aprobare.
- Serverul SQL aplică la pornire migrările CRM 070–073, fără să depindă de modul relațional global. Sunt completate coloanele pentru linkuri publice: revizie, statut și momentul deciziei.
- Fișa unei oferte se deschide chiar dacă linkurile publice sunt temporar indisponibile; eroarea nu mai ascunde oferta.

## După aplicare

1. Aplică update-ul și așteaptă repornirea aplicației.
2. Reîncarcă pagina cu `Ctrl+F5`.
3. Deschide **CRM / Vânzări → Oferte comerciale**.
4. Confirmă că apar oferta în draft și oferta „În aprobare”, apoi deschide fiecare ofertă prin click pe rând.
