IF OBJECT_ID(N'dbo.accounting_periods', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_periods (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    status NVARCHAR(20) DEFAULT 'deschisa',
    inchisa_de INT NULL,
    inchisa_la DATETIME2 NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_accounting_period UNIQUE (an, luna)
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_chart', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_chart (
    id INT IDENTITY(1,1) PRIMARY KEY,
    simbol NVARCHAR(20) NOT NULL UNIQUE,
    denumire NVARCHAR(300) NOT NULL,
    clasa TINYINT NOT NULL,
    tip CHAR(1) NOT NULL,
    nivel TINYINT NOT NULL,
    parinte_simbol NVARCHAR(20) NULL,
    tip_cont NVARCHAR(30) NULL,
    tva_deductibil BIT DEFAULT 0,
    tva_colectat BIT DEFAULT 0,
    activ BIT DEFAULT 1,
    sistem BIT DEFAULT 1
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_journals', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_journals (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    data DATE NOT NULL,
    nr_document NVARCHAR(50) NULL,
    tip_document NVARCHAR(30) NOT NULL,
    document_ref_id INT NULL,
    document_ref_tip NVARCHAR(30) NULL,
    explicatie NVARCHAR(500) NULL,
    total_debit DECIMAL(18,2) NOT NULL,
    total_credit DECIMAL(18,2) NOT NULL,
    status NVARCHAR(20) DEFAULT 'activ',
    stornat_de_id INT NULL,
    storneaza_id INT NULL,
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    updated_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_journal_lines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_journal_lines (
    id INT IDENTITY(1,1) PRIMARY KEY,
    journal_id INT NOT NULL,
    linie_nr TINYINT NOT NULL,
    cont_simbol NVARCHAR(20) NOT NULL,
    denumire_cont NVARCHAR(300) NULL,
    debit DECIMAL(18,2) DEFAULT 0,
    credit DECIMAL(18,2) DEFAULT 0,
    tert_id INT NULL,
    tert_tip NVARCHAR(10) NULL,
    explicatie NVARCHAR(300) NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_third_parties', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_third_parties (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cod NVARCHAR(10) NOT NULL UNIQUE,
    tip NVARCHAR(10) NOT NULL,
    denumire NVARCHAR(300) NOT NULL,
    cui NVARCHAR(20) NULL,
    nr_reg_com NVARCHAR(30) NULL,
    tara CHAR(2) DEFAULT 'RO',
    judet NVARCHAR(50) NULL,
    localitate NVARCHAR(100) NULL,
    adresa NVARCHAR(300) NULL,
    iban NVARCHAR(34) NULL,
    banca NVARCHAR(100) NULL,
    telefon NVARCHAR(20) NULL,
    email NVARCHAR(100) NULL,
    tva_platitor BIT DEFAULT 0,
    zile_scadenta INT DEFAULT 30,
    cont_analitic_furnizor NVARCHAR(20) NULL,
    cont_analitic_client NVARCHAR(20) NULL,
    blocat BIT DEFAULT 0,
    activ BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_invoices_in', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_invoices_in (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    nr_intern INT NULL,
    nr_document NVARCHAR(50) NOT NULL,
    furnizor_id INT NOT NULL,
    data DATE NOT NULL,
    data_scadenta DATE NULL,
    valoare DECIMAL(18,2) NOT NULL,
    tva_procent DECIMAL(5,2) DEFAULT 21,
    tva DECIMAL(18,2) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    achitat DECIMAL(18,2) DEFAULT 0,
    neachitat AS (total - achitat) PERSISTED,
    cont_cheltuiala NVARCHAR(20) NULL,
    explicatie NVARCHAR(500) NULL,
    journal_id INT NULL,
    status NVARCHAR(20) DEFAULT 'draft',
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_invoices_out', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_invoices_out (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    serie NVARCHAR(10) NULL,
    numar INT NULL,
    client_id INT NOT NULL,
    data DATE NOT NULL,
    data_scadenta DATE NULL,
    valoare DECIMAL(18,2) NOT NULL,
    tva_procent DECIMAL(5,2) DEFAULT 21,
    tva DECIMAL(18,2) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    incasat DECIMAL(18,2) DEFAULT 0,
    neincasat AS (total - incasat) PERSISTED,
    cont_venit NVARCHAR(20) NULL,
    explicatie NVARCHAR(500) NULL,
    journal_id INT NULL,
    status NVARCHAR(20) DEFAULT 'draft',
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_treasury', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_treasury (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    an INT NOT NULL,
    luna TINYINT NOT NULL,
    tip NVARCHAR(10) NOT NULL,
    cont_trezorerie NVARCHAR(20) NOT NULL,
    data DATE NOT NULL,
    nr_document NVARCHAR(50) NULL,
    tip_operatie NVARCHAR(20) NOT NULL,
    suma DECIMAL(18,2) NOT NULL,
    cont_corespondent NVARCHAR(20) NULL,
    tert_id INT NULL,
    explicatie NVARCHAR(300) NULL,
    journal_id INT NULL,
    status NVARCHAR(20) DEFAULT 'draft',
    created_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.accounting_law_alerts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_law_alerts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    titlu NVARCHAR(300) NOT NULL,
    descriere NVARCHAR(MAX) NULL,
    sursa_url NVARCHAR(500) NULL,
    data_publicare DATE NULL,
    tip NVARCHAR(30) NULL,
    afecteaza_modul NVARCHAR(50) NULL,
    status NVARCHAR(20) DEFAULT 'nou',
    citit_de INT NULL,
    citit_la DATETIME2 NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO
