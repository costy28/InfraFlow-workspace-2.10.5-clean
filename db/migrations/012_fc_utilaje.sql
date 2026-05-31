IF SCHEMA_ID(N'fleet') IS NULL
BEGIN
  EXEC('CREATE SCHEMA fleet')
END
GO

IF OBJECT_ID(N'fleet.faz_activities_nomenclator', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.faz_activities_nomenclator (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fleet_faz_activities_nomenclator PRIMARY KEY,
    denumire NVARCHAR(200) NOT NULL,
    detalii NVARCHAR(200) NULL,
    grup NVARCHAR(50) NULL,
    activ BIT NOT NULL CONSTRAINT DF_faz_activities_nomenclator_activ DEFAULT 1
  )
END
GO

IF OBJECT_ID(N'fleet.fc_logs', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.fc_logs (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fleet_fc_logs PRIMARY KEY,
    uuid CHAR(36) NOT NULL CONSTRAINT DF_fc_logs_uuid DEFAULT NEWID(),
    asset_id INT NOT NULL,
    operator_id INT NULL,
    operator_text NVARCHAR(150) NULL,
    data DATE NOT NULL,
    numar INT NULL,
    luna DATE NOT NULL,
    locatie NVARCHAR(300) NULL,
    tip_activitate_id INT NULL,
    activitati_text NVARCHAR(MAX) NULL,
    ore_program DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_program DEFAULT 0,
    ore_lucru_efectiv DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_lucru_efectiv DEFAULT 0,
    ore_deplasare DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_deplasare DEFAULT 0,
    ore_asteptare DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_asteptare DEFAULT 0,
    ore_imobilizare DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_imobilizare DEFAULT 0,
    ore_reparatii DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_reparatii DEFAULT 0,
    ore_standby DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_standby DEFAULT 0,
    ore_defect DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_defect DEFAULT 0,
    ore_ll DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_ll DEFAULT 0,
    ore_sll DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_sll DEFAULT 0,
    ore_lm DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_lm DEFAULT 0,
    ore_lc DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_lc DEFAULT 0,
    ore_ac DECIMAL(6,2) NOT NULL CONSTRAINT DF_fc_logs_ore_ac DEFAULT 0,
    ore_total AS (ore_lucru_efectiv + ore_deplasare + ore_asteptare + ore_imobilizare + ore_reparatii + ore_standby + ore_defect + ore_ll + ore_sll + ore_lm + ore_lc + ore_ac),
    motorina_l DECIMAL(8,2) NOT NULL CONSTRAINT DF_fc_logs_motorina_l DEFAULT 0,
    benzina_l DECIMAL(8,2) NOT NULL CONSTRAINT DF_fc_logs_benzina_l DEFAULT 0,
    ulei_motor_l DECIMAL(6,3) NOT NULL CONSTRAINT DF_fc_logs_ulei_motor_l DEFAULT 0,
    ulei_hidraulic_l DECIMAL(6,3) NOT NULL CONSTRAINT DF_fc_logs_ulei_hidraulic_l DEFAULT 0,
    ulei_transmisie_l DECIMAL(6,3) NOT NULL CONSTRAINT DF_fc_logs_ulei_transmisie_l DEFAULT 0,
    vaselina_kg DECIMAL(6,3) NOT NULL CONSTRAINT DF_fc_logs_vaselina_kg DEFAULT 0,
    consum_orar_normat DECIMAL(6,2) NULL,
    consum_normat AS (ore_lucru_efectiv * consum_orar_normat),
    diferenta_motorina AS (motorina_l - (ore_lucru_efectiv * consum_orar_normat)),
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_fc_logs_status DEFAULT 'draft',
    autominder_id INT NULL,
    creat_de INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_fc_logs_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_fc_logs_uuid UNIQUE (uuid),
    CONSTRAINT FK_fc_logs_asset FOREIGN KEY (asset_id) REFERENCES fleet.assets(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fc_logs_operator FOREIGN KEY (operator_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fc_logs_tip_activitate FOREIGN KEY (tip_activitate_id) REFERENCES fleet.faz_activities_nomenclator(id) ON DELETE NO ACTION,
    CONSTRAINT FK_fc_logs_creat_de FOREIGN KEY (creat_de) REFERENCES core.users(id) ON DELETE NO ACTION
  )
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fc_logs_asset_id' AND object_id = OBJECT_ID(N'fleet.fc_logs'))
BEGIN
  CREATE INDEX IX_fc_logs_asset_id ON fleet.fc_logs(asset_id)
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fc_logs_operator_id' AND object_id = OBJECT_ID(N'fleet.fc_logs'))
BEGIN
  CREATE INDEX IX_fc_logs_operator_id ON fleet.fc_logs(operator_id)
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fc_logs_data' AND object_id = OBJECT_ID(N'fleet.fc_logs'))
BEGIN
  CREATE INDEX IX_fc_logs_data ON fleet.fc_logs(data)
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fc_logs_luna' AND object_id = OBJECT_ID(N'fleet.fc_logs'))
BEGIN
  CREATE INDEX IX_fc_logs_luna ON fleet.fc_logs(luna)
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fc_logs_status' AND object_id = OBJECT_ID(N'fleet.fc_logs'))
BEGIN
  CREATE INDEX IX_fc_logs_status ON fleet.fc_logs(status)
END
GO

IF OBJECT_ID(N'fleet.faz_activities_nomenclator', N'U') IS NOT NULL
BEGIN
  SET IDENTITY_INSERT fleet.faz_activities_nomenclator ON

  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 1) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (1, 'DESZAPEZIRE', NULL, 'deszapezire', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 2) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (2, 'BALASTARE STRADA TARNEI', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 3) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (3, 'FREZAT', 'ASFALT', 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 4) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (4, 'DESCARCARE', 'PAVELE', 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 5) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (5, 'INCARCARE', 'BALAST, PAMANT', 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 6) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (6, 'INCARCARE', 'REFUZ FREZA', 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 7) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (7, 'MATURARE', 'MATURAT SUPRAFATA LUCRU', 'salubrizare', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 8) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (8, 'INCARCARE', 'PAVELE', 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 9) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (9, 'REPARATII', 'DEFECT', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 10) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (10, 'MUTAT AGREGATE', NULL, 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 11) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (11, 'INCARCAT BETON', 'FORMATIA BETOANE', 'betoane', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 12) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (12, 'ALIMENTARE STATIE ASFALT', NULL, 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 13) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (13, 'PICONAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 14) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (14, 'PICONAT SI INCARCAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 15) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (15, 'ESCAVAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 16) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (16, 'COMPACTAT ASFALT', 'COMPACTAT ASFALT', 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 17) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (17, 'TERASAT', 'TERASAT', 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 18) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (18, 'ASTERNERE ASFALT', 'ASTERNERE ASFALT', 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 19) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (19, 'SCHIMBARE PUNCT DE LUCRU', 'MUTAT FINISOR', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 20) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (20, 'ALIMENTARE', 'ALIMENTARE CU CARBURANT', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 21) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (21, 'FREZAT', 'FREZAT ASFALT', 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 22) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (22, 'PICONAT', 'PICONAT', 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 23) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (23, 'TAIAT ASFALT', 'TAIAT ASFALT', 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 24) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (24, 'IMPRASTIAT EMULSIE BITUMINOASA', NULL, 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 25) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (25, 'SPALAT UTILAJE', 'SPALAT UTILAJE', 'salubrizare', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 26) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (26, 'TRANSPORT APA', NULL, 'transport', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 27) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (27, 'MATURAT', NULL, 'salubrizare', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 28) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (28, 'TRANSPORT APA SI MATURAT', NULL, 'salubrizare', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 29) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (29, 'SUDURA', 'SUDURA', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 30) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (30, 'MARCAJ RUTIER', 'MARCAJ RUTIER', 'siguranta_circ', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 31) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (31, 'TRACTAT MASINA MARCAJ', NULL, 'siguranta_circ', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 32) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (32, 'CAMINE', 'SCHIMBARE PLANSEE', 'canalizare', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 33) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (33, 'BORDURI', 'SCHIMBAT/SPART BORDURA', 'siguranta_circ', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 34) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (34, 'SPATII JOACA', NULL, 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 35) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (35, 'PROFILAT DRUM', 'PROFILAT', 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 36) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (36, 'TERASAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 37) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (37, 'TAIAT BETON', 'TAIAT BETON', 'betoane', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 38) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (38, 'COMPACTAT SI TERASAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 39) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (39, 'PICONAT', NULL, 'terasamente', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 40) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (40, 'TAIAT', NULL, 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 41) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (41, 'ASTERNERE ASFALT', NULL, 'lucrari_asfalt', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 42) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (42, 'STAT LA DISPOZITIE', 'STAT LA DISPOZITIE', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 43) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (43, 'INTRETINERE', 'INTRETINERE', 'diverse', 1)
  IF NOT EXISTS (SELECT 1 FROM fleet.faz_activities_nomenclator WHERE id = 44) INSERT INTO fleet.faz_activities_nomenclator (id, denumire, detalii, grup, activ) VALUES (44, 'STATIE ASFALT', NULL, 'lucrari_asfalt', 1)

  SET IDENTITY_INSERT fleet.faz_activities_nomenclator OFF
END
GO
