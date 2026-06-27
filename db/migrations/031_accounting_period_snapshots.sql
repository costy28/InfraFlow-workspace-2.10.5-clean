IF OBJECT_ID(N'dbo.accounting_period_snapshots', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_period_snapshots (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    luna INT NOT NULL,
    versiune INT NOT NULL,
    checksum CHAR(64) NOT NULL,
    created_by INT NULL,
    created_by_name NVARCHAR(200) NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    snapshot_json NVARCHAR(MAX) NULL
  );
  CREATE INDEX IX_accounting_period_snapshots_period ON dbo.accounting_period_snapshots(an, luna, versiune);
END;
GO

IF OBJECT_ID(N'dbo.accounting_period_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_period_events (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    luna INT NOT NULL,
    tip NVARCHAR(30) NOT NULL,
    user_id INT NULL,
    user_name NVARCHAR(200) NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    event_json NVARCHAR(MAX) NULL
  );
  CREATE INDEX IX_accounting_period_events_period ON dbo.accounting_period_events(an, luna, created_at);
END;
GO
