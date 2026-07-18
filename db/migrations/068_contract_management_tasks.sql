IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'contract_management')
BEGIN
  EXEC('CREATE SCHEMA contract_management')
END
GO

IF OBJECT_ID('contract_management.tasks', 'U') IS NULL
BEGIN
  CREATE TABLE contract_management.tasks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    contract_id INT NOT NULL,
    alert_code NVARCHAR(80) NULL,
    alert_level NVARCHAR(40) NULL,
    titlu NVARCHAR(300) NOT NULL,
    descriere NVARCHAR(MAX) NULL,
    status NVARCHAR(40) NOT NULL DEFAULT N'deschis',
    prioritate NVARCHAR(40) NOT NULL DEFAULT N'normala',
    deadline DATE NULL,
    responsabil_id NVARCHAR(80) NULL,
    responsabil_nume NVARCHAR(200) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL,
    resolved_by NVARCHAR(80) NULL,
    resolved_at DATETIME2 NULL,
    resolution_note NVARCHAR(1000) NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT FK_contract_management_tasks_contract
      FOREIGN KEY (contract_id) REFERENCES contract_management.contracts(id)
  )
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_contract_management_tasks_contract_status'
    AND object_id = OBJECT_ID('contract_management.tasks')
)
BEGIN
  CREATE INDEX IX_contract_management_tasks_contract_status
    ON contract_management.tasks(contract_id, status, deadline)
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_contract_management_tasks_open_alert'
    AND object_id = OBJECT_ID('contract_management.tasks')
)
BEGIN
  CREATE UNIQUE INDEX UX_contract_management_tasks_open_alert
    ON contract_management.tasks(contract_id, alert_code)
    WHERE cancelled_at IS NULL AND status NOT IN (N'rezolvat', N'inchis', N'anulat')
END
GO
