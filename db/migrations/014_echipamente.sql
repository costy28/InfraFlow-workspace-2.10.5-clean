IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr')

IF OBJECT_ID(N'hr.echipamente_tipuri', N'U') IS NULL
BEGIN
  CREATE TABLE hr.echipamente_tipuri (
    id INT IDENTITY(1,1) PRIMARY KEY,
    denumire NVARCHAR(100) NOT NULL UNIQUE,
    tip_marimi NVARCHAR(20) NOT NULL,
    durata_luni INT NOT NULL,
    activ BIT NOT NULL DEFAULT 1
  )
END

IF OBJECT_ID(N'hr.echipamente_marimi', N'U') IS NULL
BEGIN
  CREATE TABLE hr.echipamente_marimi (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tip_id INT NOT NULL,
    marime NVARCHAR(20) NOT NULL,
    ordine INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_hr_echipamente_marimi_tip FOREIGN KEY (tip_id) REFERENCES hr.echipamente_tipuri(id),
    CONSTRAINT UQ_hr_echipamente_marimi UNIQUE (tip_id, marime)
  )
END

IF OBJECT_ID(N'hr.echipamente_departament', N'U') IS NULL
BEGIN
  CREATE TABLE hr.echipamente_departament (
    id INT IDENTITY(1,1) PRIMARY KEY,
    departament_id UNIQUEIDENTIFIER NOT NULL,
    tip_id INT NOT NULL,
    culoare NVARCHAR(50) NULL,
    cod_articol NVARCHAR(100) NULL,
    obligatoriu BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_hr_echipamente_departament_tip FOREIGN KEY (tip_id) REFERENCES hr.echipamente_tipuri(id),
    CONSTRAINT FK_hr_echipamente_departament_department FOREIGN KEY (departament_id) REFERENCES core.departments(id)
  )
END

IF OBJECT_ID(N'hr.angajat_echipamente', N'U') IS NULL
BEGIN
  CREATE TABLE hr.angajat_echipamente (
    id INT IDENTITY(1,1) PRIMARY KEY,
    angajat_id INT NOT NULL,
    tip_id INT NOT NULL,
    marime NVARCHAR(20) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_by UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_hr_angajat_echipamente_angajat FOREIGN KEY (angajat_id) REFERENCES hr.employees(id),
    CONSTRAINT FK_hr_angajat_echipamente_tip FOREIGN KEY (tip_id) REFERENCES hr.echipamente_tipuri(id),
    CONSTRAINT FK_hr_angajat_echipamente_user FOREIGN KEY (updated_by) REFERENCES core.users(id),
    CONSTRAINT UQ_hr_angajat_echipamente UNIQUE (angajat_id, tip_id)
  )
END

IF OBJECT_ID(N'hr.echipamente_dotari', N'U') IS NULL
BEGIN
  CREATE TABLE hr.echipamente_dotari (
    id INT IDENTITY(1,1) PRIMARY KEY,
    angajat_id INT NOT NULL,
    tip_id INT NOT NULL,
    marime NVARCHAR(20) NULL,
    data_dotare DATE NOT NULL,
    cantitate DECIMAL(10,2) NOT NULL DEFAULT 1,
    stare NVARCHAR(30) NOT NULL DEFAULT N'predat',
    durata_luni INT NOT NULL,
    data_expirare AS DATEADD(month, durata_luni, data_dotare),
    observatii NVARCHAR(500) NULL,
    inregistrat_de UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_hr_echipamente_dotari_angajat FOREIGN KEY (angajat_id) REFERENCES hr.employees(id),
    CONSTRAINT FK_hr_echipamente_dotari_tip FOREIGN KEY (tip_id) REFERENCES hr.echipamente_tipuri(id),
    CONSTRAINT FK_hr_echipamente_dotari_user FOREIGN KEY (inregistrat_de) REFERENCES core.users(id)
  )
END

IF NOT EXISTS (SELECT 1 FROM hr.echipamente_tipuri)
BEGIN
  INSERT INTO hr.echipamente_tipuri (denumire, tip_marimi, durata_luni) VALUES
    (N'Salopeta', N'numeric', 12), (N'Bocanci', N'numeric', 12),
    (N'Cizme cauciuc', N'numeric', 24), (N'Jacheta', N'numeric', 12),
    (N'Pantalon', N'numeric', 12), (N'Vesta reflectorizanta', N'text', 12)

  INSERT INTO hr.echipamente_marimi (tip_id, marime, ordine)
  SELECT t.id, CONVERT(nvarchar(20), n.val), n.val FROM hr.echipamente_tipuri t
  CROSS APPLY (VALUES (40),(42),(44),(46),(48),(50),(52),(54),(56),(58),(60),(62),(64),(66)) n(val)
  WHERE t.denumire IN (N'Salopeta', N'Jacheta', N'Pantalon')

  INSERT INTO hr.echipamente_marimi (tip_id, marime, ordine)
  SELECT t.id, CONVERT(nvarchar(20), n.val), n.val FROM hr.echipamente_tipuri t
  CROSS APPLY (VALUES (38),(39),(40),(41),(42),(43),(44),(45),(46)) n(val)
  WHERE t.denumire IN (N'Bocanci', N'Cizme cauciuc')

  INSERT INTO hr.echipamente_marimi (tip_id, marime, ordine)
  SELECT id, n.marime, n.ordine FROM hr.echipamente_tipuri
  CROSS APPLY (VALUES (N'S',1),(N'M',2),(N'L',3),(N'XL',4)) n(marime, ordine)
  WHERE denumire = N'Vesta reflectorizanta'
END

IF NOT EXISTS (SELECT 1 FROM hr.echipamente_departament)
BEGIN
  INSERT INTO hr.echipamente_departament (departament_id, tip_id, culoare, cod_articol, obligatoriu)
  SELECT d.id, t.id, cfg.culoare, cfg.cod_articol, 1
  FROM (VALUES
    (N'Mecanizare', N'Bleomarin', N'Ares 82,83'),
    (N'Asfalt', N'Portocaliu', N'4100217'),
    (N'Betoane', N'Bleomarin', N'4100217'),
    (N'St.Asfalt', N'Portocaliu', N'4100217'),
    (N'Canalizare', N'Bleomarin', N'4100217'),
    (N'Salubrizare', N'Kaki', N'Ares 82,83'),
    (N'Circulatie', N'Reflectorizant', N'')
  ) cfg(departament, culoare, cod_articol)
  INNER JOIN core.departments d ON LOWER(d.name) = LOWER(cfg.departament)
  CROSS JOIN hr.echipamente_tipuri t
END
