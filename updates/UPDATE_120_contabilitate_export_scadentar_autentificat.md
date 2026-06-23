# UPDATE 120 - Contabilitate: export scadentar autentificat

Versiune: 2.12.99 -> 2.12.100  
Data: 2026-06-23

## Modificari

- Exportul scadentar din paginile Furnizori si Clienti foloseste clientul API autentificat.
- Descarcarea fisierului Excel se face ca blob, fara navigare directa catre `/api`.
- Mesajul de eroare este afisat in pagina daca exportul nu poate fi generat.

## Verificare

- `npm run build`
- `npm run check`
