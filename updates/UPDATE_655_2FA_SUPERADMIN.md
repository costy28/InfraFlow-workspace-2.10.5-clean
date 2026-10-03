# UPDATE 655 — Autentificare în doi pași pentru superadmin

Versiune: `2.12.635`  
Data: `2026-10-03`

## Ce aduce

- Configurare TOTP pentru contul de superadmin din **Setări → Securitate**.
- Compatibilitate cu Google Authenticator, Microsoft Authenticator, 1Password și aplicații TOTP similare.
- Coduri de recuperare afișate o singură dată după activare și regenerate numai după confirmare cu un cod valid.
- Loginul superadminului cere parola, apoi codul TOTP sau un cod de recuperare.
- Secretul TOTP este criptat, iar codurile de recuperare sunt păstrate exclusiv ca hash.
- Activarea, validările și regenerarea codurilor sunt vizibile în jurnalul de securitate.

## Verificare

1. Autentifică-te ca superadmin și deschide **Setări → Securitate**.
2. Apasă **Configurează 2FA**, introdu cheia în aplicația Authenticator și confirmă codul curent.
3. Salvează codurile de recuperare înainte de a închide fereastra.
4. Deloghează-te; la următoarea autentificare, după parolă, introdu codul temporar.
