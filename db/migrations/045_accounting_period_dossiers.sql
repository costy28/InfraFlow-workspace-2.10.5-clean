IF SCHEMA_ID(N'accounting') IS NULL EXEC(N'CREATE SCHEMA accounting');

IF OBJECT_ID(N'accounting.period_dossiers', N'U') IS NULL
CREATE TABLE accounting.period_dossiers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  an INT NOT NULL,
  luna INT NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'generat',
  sha256 CHAR(64) NOT NULL,
  file_size BIGINT NULL,
  created_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE INDEX ix_period_dossiers_period ON accounting.period_dossiers(an, luna, created_at);
