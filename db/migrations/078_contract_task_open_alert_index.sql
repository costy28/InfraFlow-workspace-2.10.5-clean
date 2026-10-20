-- Recuperare pentru instalații care au 068 în istoric, dar indexul lipsește.
-- Păstrăm semantica veche, inclusiv comportamentul NULL al cheii unice.
IF OBJECT_ID(N'contract_management.tasks', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'contract_management.tasks') AND name=N'UX_contract_management_tasks_open_alert')
BEGIN
  IF EXISTS(SELECT 1 FROM contract_management.tasks
    WHERE cancelled_at IS NULL AND status <> N'rezolvat' AND status <> N'inchis' AND status <> N'anulat'
    GROUP BY contract_id,alert_code HAVING COUNT(*)>1)
    THROW 51078, 'Indexul alertelor contractuale necesita verificare manuala: exista task-uri active duplicate. Nu s-au modificat date.', 1;

  CREATE UNIQUE INDEX UX_contract_management_tasks_open_alert
    ON contract_management.tasks(contract_id,alert_code)
    WHERE cancelled_at IS NULL AND status <> N'rezolvat' AND status <> N'inchis' AND status <> N'anulat';
END;
