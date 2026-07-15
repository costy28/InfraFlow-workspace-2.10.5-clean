IF SCHEMA_ID(N'environment') IS NULL
  EXEC(N'CREATE SCHEMA environment');
GO

IF OBJECT_ID(N'environment.autorizatii', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.autorizatii (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    tip NVARCHAR(80) NOT NULL,
    numar NVARCHAR(80) NOT NULL,
    data_emitere DATE NULL,
    data_expirare DATE NULL,
    emitent NVARCHAR(200) NULL,
    conditii NVARCHAR(MAX) NULL,
    notificare_zile INT NOT NULL DEFAULT 60,
    status NVARCHAR(30) NOT NULL DEFAULT N''valida'',
    fisier_path NVARCHAR(500) NULL,
    alertat_la DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    created_by INT NULL
  )');
GO

IF OBJECT_ID(N'environment.coduri_deseuri', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.coduri_deseuri (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cod NVARCHAR(20) NOT NULL UNIQUE,
    denumire NVARCHAR(500) NOT NULL,
    tip NVARCHAR(30) NOT NULL DEFAULT N''proddes'',
    periculos BIT NOT NULL DEFAULT 0,
    activ BIT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT GETDATE()
  )');
GO

IF OBJECT_ID(N'environment.deseuri', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.deseuri (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    cod_deseu NVARCHAR(20) NOT NULL,
    denumire NVARCHAR(500) NOT NULL,
    cantitate_gen DECIMAL(15,3) NOT NULL DEFAULT 0,
    cantitate_valorificata DECIMAL(15,3) NOT NULL DEFAULT 0,
    cantitate_eliminata DECIMAL(15,3) NOT NULL DEFAULT 0,
    stoc_final DECIMAL(15,3) NOT NULL DEFAULT 0,
    operator_valorificare NVARCHAR(200) NULL,
    operator_eliminare NVARCHAR(200) NULL,
    sursa_auto NVARCHAR(200) NULL,
    observatii NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME NULL
  )');
GO

IF OBJECT_ID(N'environment.deseuri_municipale', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.deseuri_municipale (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    luna TINYINT NULL,
    cod_deseu NVARCHAR(20) NOT NULL,
    denumire NVARCHAR(500) NOT NULL,
    cantitate_colectata DECIMAL(15,3) NOT NULL DEFAULT 0,
    cantitate_reciclata DECIMAL(15,3) NOT NULL DEFAULT 0,
    cantitate_depozitata DECIMAL(15,3) NOT NULL DEFAULT 0,
    localitate NVARCHAR(150) NULL,
    operator NVARCHAR(200) NULL,
    observatii NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME NULL
  )');
GO

IF OBJECT_ID(N'environment.emisii', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.emisii (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    sursa NVARCHAR(200) NOT NULL,
    poluant NVARCHAR(100) NOT NULL,
    cantitate DECIMAL(15,3) NOT NULL DEFAULT 0,
    um NVARCHAR(30) NOT NULL DEFAULT N''kg'',
    metoda_calcul NVARCHAR(300) NULL,
    observatii NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    created_by INT NULL
  )');
GO

IF OBJECT_ID(N'environment.monitorizare', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.monitorizare (
    id INT IDENTITY(1,1) PRIMARY KEY,
    data DATE NOT NULL,
    punct NVARCHAR(150) NOT NULL,
    indicator NVARCHAR(100) NOT NULL,
    valoare DECIMAL(15,3) NOT NULL,
    limita DECIMAL(15,3) NULL,
    um NVARCHAR(30) NULL,
    depasit BIT NOT NULL DEFAULT 0,
    masuri NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    created_by INT NULL
  )');
GO

IF OBJECT_ID(N'environment.incidente', N'U') IS NULL
  EXEC(N'CREATE TABLE environment.incidente (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    data DATETIME NOT NULL DEFAULT GETDATE(),
    locatie NVARCHAR(200) NOT NULL,
    tip NVARCHAR(100) NOT NULL,
    descriere NVARCHAR(MAX) NULL,
    gravitate NVARCHAR(30) NOT NULL DEFAULT N''medie'',
    masuri NVARCHAR(MAX) NULL,
    responsabil_id INT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N''deschis'',
    inchis_la DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    created_by INT NULL
  )');
GO

IF NOT EXISTS (SELECT 1 FROM environment.autorizatii WHERE numar = N'37/04.03.2020 REV 23.08.2024')
INSERT INTO environment.autorizatii (tip, numar, data_emitere, data_expirare, emitent, conditii, notificare_zile, status)
VALUES (
  N'Autorizație de mediu',
  N'37/04.03.2020 REV 23.08.2024',
  '2024-08-23',
  NULL,
  N'Agenția pentru Protecția Mediului',
  N'Autorizație de mediu demo - monitorizare conform obligațiilor legale.',
  60,
  N'valida'
);
GO

IF NOT EXISTS (SELECT 1 FROM environment.coduri_deseuri WHERE cod = N'13 02 05*')
BEGIN
  INSERT INTO environment.coduri_deseuri (cod, denumire, tip, periculos) VALUES
  (N'13 02 05*', N'Uleiuri minerale neclorurate de motor, de transmisie și de ungere', N'proddes', 1),
  (N'15 01 01', N'Ambalaje de hârtie și carton', N'proddes', 0),
  (N'15 01 02', N'Ambalaje de materiale plastice', N'proddes', 0),
  (N'15 01 10*', N'Ambalaje care conțin reziduuri de substanțe periculoase', N'proddes', 1),
  (N'16 01 03', N'Anvelope scoase din uz', N'proddes', 0),
  (N'16 06 01*', N'Baterii cu plumb', N'proddes', 1),
  (N'17 03 02', N'Mixturi asfaltice, altele decât cele specificate la 17 03 01', N'proddes', 0),
  (N'17 05 04', N'Pământ și pietre, altele decât cele specificate la 17 05 03', N'proddes', 0),
  (N'20 01 01', N'Hârtie și carton', N'mun', 0),
  (N'20 01 02', N'Sticla', N'mun', 0),
  (N'20 01 08', N'Deșeuri biodegradabile de la bucătării și cantine', N'mun', 0),
  (N'20 01 39', N'Materiale plastice', N'mun', 0),
  (N'20 02 01', N'Deșeuri biodegradabile', N'mun', 0),
  (N'20 03 01', N'Deșeuri municipale amestecate', N'mun', 0),
  (N'20 03 07', N'Deșeuri voluminoase', N'mun', 0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_environment_deseuri_an_cod' AND object_id = OBJECT_ID(N'environment.deseuri'))
  EXEC(N'CREATE INDEX IX_environment_deseuri_an_cod ON environment.deseuri(an, cod_deseu)');
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_environment_monitorizare_data' AND object_id = OBJECT_ID(N'environment.monitorizare'))
  EXEC(N'CREATE INDEX IX_environment_monitorizare_data ON environment.monitorizare(data)');
GO
