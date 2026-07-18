IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'contract_management')
BEGIN
  EXEC('CREATE SCHEMA contract_management')
END
GO

IF OBJECT_ID('contract_management.contracts', 'U') IS NULL
BEGIN
  CREATE TABLE contract_management.contracts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    numar NVARCHAR(80) NOT NULL,
    titlu NVARCHAR(300) NOT NULL,
    tip NVARCHAR(40) NOT NULL DEFAULT N'achizitie',
    status NVARCHAR(40) NOT NULL DEFAULT N'activ',
    partener NVARCHAR(300) NULL,
    partener_tip NVARCHAR(40) NULL,
    valoare_contract DECIMAL(18,2) NOT NULL DEFAULT 0,
    moneda NVARCHAR(10) NOT NULL DEFAULT N'RON',
    data_semnare DATE NULL,
    data_start DATE NULL,
    data_sfarsit DATE NULL,
    responsabil_id NVARCHAR(80) NULL,
    responsabil_nume NVARCHAR(200) NULL,
    departament_id NVARCHAR(80) NULL,
    centru_cost_id NVARCHAR(80) NULL,
    cpv_cod NVARCHAR(30) NULL,
    cpv_denumire NVARCHAR(500) NULL,
    paap_id NVARCHAR(80) NULL,
    prag_avertizare DECIMAL(5,2) NOT NULL DEFAULT 80,
    prag_critic DECIMAL(5,2) NOT NULL DEFAULT 90,
    prag_depasire DECIMAL(5,2) NOT NULL DEFAULT 100,
    observatii NVARCHAR(MAX) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_by NVARCHAR(80) NULL,
    updated_at DATETIME2 NULL,
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL
  )
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_contract_management_contracts_numar_active'
    AND object_id = OBJECT_ID('contract_management.contracts')
)
BEGIN
  CREATE UNIQUE INDEX UX_contract_management_contracts_numar_active
    ON contract_management.contracts(numar)
    WHERE cancelled_at IS NULL
END
GO

IF OBJECT_ID('contract_management.consumptions', 'U') IS NULL
BEGIN
  CREATE TABLE contract_management.consumptions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    contract_id INT NOT NULL,
    data DATE NOT NULL,
    sursa NVARCHAR(60) NOT NULL DEFAULT N'manual',
    sursa_id NVARCHAR(120) NULL,
    document_nr NVARCHAR(120) NULL,
    descriere NVARCHAR(500) NULL,
    valoare DECIMAL(18,2) NOT NULL DEFAULT 0,
    moneda NVARCHAR(10) NOT NULL DEFAULT N'RON',
    cpv_cod NVARCHAR(30) NULL,
    created_by NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    cancelled_by NVARCHAR(80) NULL,
    cancelled_at DATETIME2 NULL,
    cancelled_reason NVARCHAR(500) NULL,
    CONSTRAINT FK_contract_management_consumptions_contract
      FOREIGN KEY (contract_id) REFERENCES contract_management.contracts(id)
  )
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_contract_management_consumptions_contract'
    AND object_id = OBJECT_ID('contract_management.consumptions')
)
BEGIN
  CREATE INDEX IX_contract_management_consumptions_contract
    ON contract_management.consumptions(contract_id, data)
END
GO
