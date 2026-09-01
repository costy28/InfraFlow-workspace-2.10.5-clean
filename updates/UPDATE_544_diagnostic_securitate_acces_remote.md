# UPDATE 544 — Diagnostic securitate și acces remote

Versiune: 2.12.524  
Data: 2026-09-01

## Context

InfraFlow va gestiona date sensibile, iar administratorul trebuie să poată vedea rapid dacă instalarea este protejată, ce sesiuni sunt active și cum este recomandat accesul de la distanță.

## Implementat

- Tab nou „Securitate” în Setări.
- Endpoint server-side `GET /api/system/security`, disponibil pentru utilizatori cu `settings:manage`.
- Diagnostic read-only pentru:
  - mod acces aplicație (`internal-only` / `open`);
  - sesiuni active;
  - stații autorizate;
  - URL-uri locale detectate;
  - status bază de date și notă de protecție SQL;
  - recomandări pentru remote access prin Cloudflare Tunnel/VPN.
- IP-urile sunt mascate, iar tokenurile, parolele și connection string-urile nu sunt trimise către client.
- Checklist vizual cu verdict „Protejat”, „Protejat, cu observații” sau „Necesită atenție”.

## Impact

- Crește încrederea administratorului și a clientului în instalarea locală.
- Clarifică faptul că SQL Server trebuie să rămână în spatele serverului InfraFlow, fără expunere directă pe internet.
- Pregătește pașii următori: 2FA, politici parole, expirare sesiuni și audit securitate mai avansat.

## Migrare SQL

Nu necesită migrare SQL.

## Testare recomandată

1. Aplică update-ul.
2. Intră în Setări → Sistem: Securitate.
3. Apasă „Reverifică”.
4. Confirmă că apar verdictul, sesiunile active, stațiile recente și recomandările.
