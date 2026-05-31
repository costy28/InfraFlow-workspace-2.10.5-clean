# UPDATE 011 — Fix instalare + CPV + Referat + DB

Data: 31 Mai 2026  
Versiune: 2.11.1

## Fix-uri

- Client wizard URL la instalare fresh.
- Update manual upload ZIP, ca backup la actualizarea automată.
- CPV import automat la startup, endpoint manual superadmin și fallback JSON.
- DB connection pool MSSQL cu reconnect automat și închidere controlată.
- Process crash handler: erorile necontrolate sunt logate fără oprire imediată.
- Windows Service restart automat după crash.
- Referat creat din superadmin fără departament obligatoriu.
- Migrări MSSQL aplicate automat și idempotent la startup.

## Compatibilitate

- Modul `DB_MODE=json` continuă să funcționeze fără SQL Server.
- Endpoint-ul existent `/api/system/update/upload` rămâne disponibil.
- Alias nou pentru upload manual: `/api/system/update-upload`.
