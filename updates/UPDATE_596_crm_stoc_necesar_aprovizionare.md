# UPDATE 596 — CRM Sprint 6: stoc și necesar de aprovizionare

Versiune: `v2.12.576`  
Data: `2026-09-27`

## Ce aduce

- O comandă client confirmată poate fi verificată explicit față de stocul curent.
- Rezultatul este un snapshot auditat: stocul nu se rezervă și nu se modifică automat.
- Pozițiile de tip serviciu nu intră în controlul de stoc.
- Materialele fără o mapare sigură sunt raportate ca nemapate; InfraFlow nu ghicește corespondența.
- Pentru deficitul materialelor mapate se creează necesare idempotente în lista existentă de solicitări materiale din Achiziții.
- Sistemul nu alege furnizorul și nu creează automat comandă către furnizor.

## Test manual recomandat

1. Creează o ofertă cu cel puțin un material a cărui referință corespunde unui cod sau ID din catalogul de materiale.
2. Acceptă oferta și creează comanda client.
3. Din cardul **Stoc și aprovizionare**, apasă **Verifică stocul**.
4. Confirmă că disponibilul și deficitul sunt doar raportate, fără mișcare de stoc.
5. Dacă există deficit, apasă **Creează necesar în Achiziții** și confirmă apariția solicitării materialului.
6. Repetă acțiunea: necesarul activ trebuie reutilizat, nu duplicat.
