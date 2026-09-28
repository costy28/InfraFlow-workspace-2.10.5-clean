# UPDATE 594 — CRM Sprint 5: comandă client din ofertă acceptată (v2.12.574)

## Ce aduce

- Conversie explicită dintr-o ofertă cu statut `accepted` într-o comandă client.
- O singură comandă pentru oferta/revizia acceptată, inclusiv la click repetat sau retry de rețea.
- Snapshot al ofertei, deciziei clientului și pozițiilor comenzii pentru audit.
- Anulare logică a comenzii, cu motiv obligatoriu și audit.

## Ce nu face încă

- Nu rezervă și nu verifică stocul.
- Nu creează necesar către Achiziții.
- Nu generează proformă sau factură.

Aceste operații urmează să fie legate prin porturile CRM în Sprinturile 6 și 7.
