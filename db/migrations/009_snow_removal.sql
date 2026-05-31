/*
  InfraFlow - modul deszapezire
  Migrare idempotenta pentru snow_removal.*
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'snow_removal')
BEGIN
  EXEC(N'CREATE SCHEMA snow_removal')
END

IF OBJECT_ID(N'snow_removal.seasons', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.seasons (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_seasons PRIMARY KEY,
    company_id INT NULL,
    denumire NVARCHAR(100) NOT NULL,
    data_start DATE NOT NULL,
    data_sfarsit DATE NOT NULL,
    activ BIT NOT NULL CONSTRAINT df_snow_removal_seasons_activ DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_seasons_created_at DEFAULT sysdatetime()
  )
END

IF OBJECT_ID(N'snow_removal.street_sectors', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.street_sectors (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_street_sectors PRIMARY KEY,
    season_id INT NOT NULL,
    denumire NVARCHAR(300) NOT NULL,
    cod NVARCHAR(50) NULL,
    tip NVARCHAR(30) NOT NULL,
    lungime_ml DECIMAL(8,2) NULL,
    suprafata_m2 DECIMAL(10,2) NOT NULL,
    tip_tratament NVARCHAR(20) NOT NULL,
    prioritate TINYINT NOT NULL,
    zona NVARCHAR(100) NULL,
    utilaj_default_id INT NULL,
    activ BIT NOT NULL CONSTRAINT df_snow_removal_street_sectors_activ DEFAULT 1,
    sort_order INT NOT NULL CONSTRAINT df_snow_removal_street_sectors_sort_order DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_street_sectors_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_street_sectors_season FOREIGN KEY (season_id) REFERENCES snow_removal.seasons(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_street_sectors_utilaj FOREIGN KEY (utilaj_default_id) REFERENCES fleet.assets(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_street_sectors_tip CHECK (tip IN (N'strada', N'bulevard', N'alee', N'fundatura', N'alta')),
    CONSTRAINT ck_snow_removal_street_sectors_tip_tratament CHECK (tip_tratament IN (N'sare', N'clorura', N'ambele')),
    CONSTRAINT ck_snow_removal_street_sectors_prioritate CHECK (prioritate IN (1, 2, 3))
  )
END

IF OBJECT_ID(N'snow_removal.manual_zones', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.manual_zones (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_manual_zones PRIMARY KEY,
    season_id INT NOT NULL,
    denumire NVARCHAR(300) NOT NULL,
    tip NVARCHAR(30) NOT NULL,
    suprafata_m2 DECIMAL(10,2) NOT NULL,
    zona NVARCHAR(100) NULL,
    activ BIT NOT NULL CONSTRAINT df_snow_removal_manual_zones_activ DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_manual_zones_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_manual_zones_season FOREIGN KEY (season_id) REFERENCES snow_removal.seasons(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_manual_zones_tip CHECK (tip IN (N'trotuar', N'statie_autobuz', N'trecere_pietoni', N'parcare', N'piata', N'alta'))
  )
END

IF OBJECT_ID(N'snow_removal.recipes', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.recipes (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_recipes PRIMARY KEY,
    season_id INT NOT NULL,
    denumire NVARCHAR(200) NOT NULL,
    tip_tratament NVARCHAR(20) NOT NULL,
    doza_sare_kg DECIMAL(8,3) NOT NULL CONSTRAINT df_snow_removal_recipes_doza_sare_kg DEFAULT 0,
    doza_clorura_l DECIMAL(8,3) NOT NULL CONSTRAINT df_snow_removal_recipes_doza_clorura_l DEFAULT 0,
    mc_per_cupa DECIMAL(4,2) NOT NULL CONSTRAINT df_snow_removal_recipes_mc_per_cupa DEFAULT 0.8,
    densitate DECIMAL(5,3) NOT NULL CONSTRAINT df_snow_removal_recipes_densitate DEFAULT 1.2,
    factor_corectie DECIMAL(5,3) NOT NULL CONSTRAINT df_snow_removal_recipes_factor_corectie DEFAULT 1.0,
    kg_per_cupa AS (CONVERT(DECIMAL(10,3), mc_per_cupa * densitate * factor_corectie * 1000)),
    l_per_cupa DECIMAL(8,3) NULL,
    capacitate_sararita_mc DECIMAL(4,1) NULL,
    conditie_aplicare NVARCHAR(300) NULL,
    activ BIT NOT NULL CONSTRAINT df_snow_removal_recipes_activ DEFAULT 1,
    aprobat_de INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_recipes_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_recipes_season FOREIGN KEY (season_id) REFERENCES snow_removal.seasons(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_recipes_aprobat_de FOREIGN KEY (aprobat_de) REFERENCES core.users(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_recipes_tip_tratament CHECK (tip_tratament IN (N'sare', N'clorura', N'ambele', N'lama'))
  )
END

IF OBJECT_ID(N'snow_removal.duty_logs', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.duty_logs (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_duty_logs PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    season_id INT NOT NULL,
    data DATE NOT NULL,
    ofiter_serviciu_id INT NULL,
    temperatura_start DECIMAL(4,1) NULL,
    temperatura_min DECIMAL(4,1) NULL,
    temperatura_max DECIMAL(4,1) NULL,
    conditii_meteo NVARCHAR(30) NULL,
    strat_zapada_cm DECIMAL(4,1) NOT NULL CONSTRAINT df_snow_removal_duty_logs_strat_zapada_cm DEFAULT 0,
    tip_interventie NVARCHAR(30) NOT NULL,
    motiv_neinterventie NVARCHAR(500) NULL,
    personal_json NVARCHAR(MAX) NULL,
    stoc_intrare_nisip_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_intrare_nisip_to DEFAULT 0,
    stoc_intrare_sare_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_intrare_sare_to DEFAULT 0,
    stoc_intrare_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_intrare_cacl_to DEFAULT 0,
    stoc_intrare_sol_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_intrare_sol_cacl_to DEFAULT 0,
    intrari_nisip_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_intrari_nisip_to DEFAULT 0,
    intrari_sare_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_intrari_sare_to DEFAULT 0,
    intrari_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_intrari_cacl_to DEFAULT 0,
    consum_nisip_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_consum_nisip_to DEFAULT 0,
    consum_sare_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_consum_sare_to DEFAULT 0,
    consum_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_consum_cacl_to DEFAULT 0,
    consum_sol_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_consum_sol_cacl_to DEFAULT 0,
    consum_cacl_saci INT NOT NULL CONSTRAINT df_snow_removal_duty_logs_consum_cacl_saci DEFAULT 0,
    stoc_predare_nisip_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_predare_nisip_to DEFAULT 0,
    stoc_predare_sare_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_predare_sare_to DEFAULT 0,
    stoc_predare_cacl_to DECIMAL(10,3) NOT NULL CONSTRAINT df_snow_removal_duty_logs_stoc_predare_cacl_to DEFAULT 0,
    observatii NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT df_snow_removal_duty_logs_status DEFAULT N'draft',
    creat_de INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_duty_logs_created_at DEFAULT sysdatetime(),
    updated_at DATETIME2 NULL,
    CONSTRAINT uq_snow_removal_duty_logs_uuid UNIQUE (uuid),
    CONSTRAINT uq_snow_removal_duty_logs_season_data UNIQUE (season_id, data),
    CONSTRAINT fk_snow_removal_duty_logs_season FOREIGN KEY (season_id) REFERENCES snow_removal.seasons(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_duty_logs_ofiter FOREIGN KEY (ofiter_serviciu_id) REFERENCES core.users(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_duty_logs_creat_de FOREIGN KEY (creat_de) REFERENCES core.users(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_duty_logs_conditii_meteo CHECK (conditii_meteo IS NULL OR conditii_meteo IN (N'senin', N'noros', N'ploaie', N'burna', N'ceata', N'chiciura', N'lapovita', N'ninsoare', N'viscol')),
    CONSTRAINT ck_snow_removal_duty_logs_tip_interventie CHECK (tip_interventie IN (N'fara_interventie', N'preventiv', N'activ', N'urgenta')),
    CONSTRAINT ck_snow_removal_duty_logs_status CHECK (status IN (N'draft', N'trimis', N'aprobat'))
  )
END

IF OBJECT_ID(N'snow_removal.vehicle_route_sheets', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.vehicle_route_sheets (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_vehicle_route_sheets PRIMARY KEY,
    duty_log_id INT NOT NULL,
    utilaj_id INT NOT NULL,
    nr_faz INT NOT NULL,
    deservent_1_id INT NULL,
    deservent_2_id INT NULL,
    schimb NVARCHAR(10) NOT NULL,
    ora_start TIME NULL,
    ora_sfarsit TIME NULL,
    ore_functionare_motor DECIMAL(4,2) NULL,
    ore_stationare_baza DECIMAL(4,2) NULL,
    km_parcursi DECIMAL(8,2) NULL,
    total_cupe_nisip INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_total_cupe_nisip DEFAULT 0,
    total_cupe_sare INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_total_cupe_sare DEFAULT 0,
    total_cupe_cacl INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_total_cupe_cacl DEFAULT 0,
    total_treceri INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_total_treceri DEFAULT 0,
    nisip_consumat_to DECIMAL(8,3) NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_nisip_consumat_to DEFAULT 0,
    sare_consumata_to DECIMAL(8,3) NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_sare_consumata_to DEFAULT 0,
    cacl_consumat_to DECIMAL(8,3) NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_cacl_consumat_to DEFAULT 0,
    status NVARCHAR(20) NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_status DEFAULT N'draft',
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_vehicle_route_sheets_created_at DEFAULT sysdatetime(),
    updated_at DATETIME2 NULL,
    CONSTRAINT fk_snow_removal_vehicle_route_sheets_duty_log FOREIGN KEY (duty_log_id) REFERENCES snow_removal.duty_logs(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_vehicle_route_sheets_utilaj FOREIGN KEY (utilaj_id) REFERENCES fleet.assets(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_vehicle_route_sheets_deservent_1 FOREIGN KEY (deservent_1_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_vehicle_route_sheets_deservent_2 FOREIGN KEY (deservent_2_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_vehicle_route_sheets_schimb CHECK (schimb IN (N'zi', N'noapte')),
    CONSTRAINT ck_snow_removal_vehicle_route_sheets_status CHECK (status IN (N'draft', N'completat', N'validat_gps'))
  )
END

IF OBJECT_ID(N'snow_removal.vehicle_route_lines', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.vehicle_route_lines (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_vehicle_route_lines PRIMARY KEY,
    route_sheet_id INT NOT NULL,
    sector_id INT NOT NULL,
    nr_crt INT NOT NULL,
    ora_plecare TIME NULL,
    lama BIT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_lines_lama DEFAULT 0,
    nr_treceri_lama INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_lines_nr_treceri_lama DEFAULT 0,
    nr_cupe_material INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_lines_nr_cupe_material DEFAULT 0,
    tip_material NVARCHAR(20) NULL,
    nr_treceri_material INT NOT NULL CONSTRAINT df_snow_removal_vehicle_route_lines_nr_treceri_material DEFAULT 0,
    ora_sosire TIME NULL,
    observatii NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_vehicle_route_lines_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_vehicle_route_lines_sheet FOREIGN KEY (route_sheet_id) REFERENCES snow_removal.vehicle_route_sheets(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_vehicle_route_lines_sector FOREIGN KEY (sector_id) REFERENCES snow_removal.street_sectors(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_vehicle_route_lines_tip_material CHECK (tip_material IS NULL OR tip_material IN (N'nisip', N'sare', N'cacl', N'mixt'))
  )
END

IF OBJECT_ID(N'snow_removal.standby_logs', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.standby_logs (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_standby_logs PRIMARY KEY,
    duty_log_id INT NOT NULL,
    angajat_id INT NOT NULL,
    tip_standby NVARCHAR(30) NOT NULL,
    ora_start TIME NOT NULL,
    ora_sfarsit TIME NOT NULL,
    ore_totale DECIMAL(4,2) NOT NULL,
    include_spor_noapte BIT NOT NULL CONSTRAINT df_snow_removal_standby_logs_include_spor_noapte DEFAULT 0,
    ore_noapte DECIMAL(4,2) NOT NULL CONSTRAINT df_snow_removal_standby_logs_ore_noapte DEFAULT 0,
    observatii NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_standby_logs_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_standby_logs_duty_log FOREIGN KEY (duty_log_id) REFERENCES snow_removal.duty_logs(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_standby_logs_angajat FOREIGN KEY (angajat_id) REFERENCES hr.employees(id) ON DELETE NO ACTION,
    CONSTRAINT ck_snow_removal_standby_logs_tip_standby CHECK (tip_standby IN (N'consemn_acasa', N'asteptare_sediu', N'asteptare_teren'))
  )
END

IF OBJECT_ID(N'snow_removal.gps_tracks', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.gps_tracks (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_gps_tracks PRIMARY KEY,
    intervention_id INT NULL,
    route_sheet_id INT NULL,
    utilaj_id INT NOT NULL,
    data_ora DATETIME2 NOT NULL,
    gps_lat DECIMAL(10,8) NOT NULL,
    gps_lng DECIMAL(11,8) NOT NULL,
    viteza_kmh DECIMAL(5,2) NULL,
    motor_pornit BIT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_gps_tracks_created_at DEFAULT sysdatetime(),
    CONSTRAINT fk_snow_removal_gps_tracks_route_sheet FOREIGN KEY (route_sheet_id) REFERENCES snow_removal.vehicle_route_sheets(id) ON DELETE NO ACTION,
    CONSTRAINT fk_snow_removal_gps_tracks_utilaj FOREIGN KEY (utilaj_id) REFERENCES fleet.assets(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'snow_removal.monthly_reports', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.monthly_reports (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_monthly_reports PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    season_id INT NOT NULL,
    luna DATE NOT NULL,
    zile_interventie INT NOT NULL CONSTRAINT df_snow_removal_monthly_reports_zile_interventie DEFAULT 0,
    zile_dispozitie INT NOT NULL CONSTRAINT df_snow_removal_monthly_reports_zile_dispozitie DEFAULT 0,
    ore_interventie_active DECIMAL(8,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_ore_interventie_active DEFAULT 0,
    ore_dispozitie DECIMAL(8,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_ore_dispozitie DEFAULT 0,
    suprafata_totala_tratata_m2 DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_suprafata DEFAULT 0,
    sare_totala_kg DECIMAL(12,3) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_sare DEFAULT 0,
    clorura_totala_l DECIMAL(12,3) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_clorura DEFAULT 0,
    cost_manopera_interventie DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_manopera_interventie DEFAULT 0,
    cost_manopera_dispozitie DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_manopera_dispozitie DEFAULT 0,
    cost_sporuri DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_sporuri DEFAULT 0,
    cost_utilaje DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_utilaje DEFAULT 0,
    cost_materiale DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_materiale DEFAULT 0,
    cost_total DECIMAL(15,2) NOT NULL CONSTRAINT df_snow_removal_monthly_reports_cost_total DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_monthly_reports_created_at DEFAULT sysdatetime(),
    updated_at DATETIME2 NULL,
    CONSTRAINT uq_snow_removal_monthly_reports_uuid UNIQUE (uuid),
    CONSTRAINT uq_snow_removal_monthly_reports_season_luna UNIQUE (season_id, luna),
    CONSTRAINT fk_snow_removal_monthly_reports_season FOREIGN KEY (season_id) REFERENCES snow_removal.seasons(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'snow_removal.sign_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE snow_removal.sign_tokens (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_snow_removal_sign_tokens PRIMARY KEY,
    duty_log_id INT NOT NULL,
    token CHAR(64) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    used_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_snow_removal_sign_tokens_created_at DEFAULT sysdatetime(),
    CONSTRAINT uq_snow_removal_sign_tokens_token UNIQUE (token),
    CONSTRAINT fk_snow_removal_sign_tokens_duty_log FOREIGN KEY (duty_log_id) REFERENCES snow_removal.duty_logs(id) ON DELETE NO ACTION
  )
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_street_sectors_season_id' AND object_id = OBJECT_ID(N'snow_removal.street_sectors'))
  CREATE INDEX ix_snow_removal_street_sectors_season_id ON snow_removal.street_sectors(season_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_street_sectors_utilaj_default_id' AND object_id = OBJECT_ID(N'snow_removal.street_sectors'))
  CREATE INDEX ix_snow_removal_street_sectors_utilaj_default_id ON snow_removal.street_sectors(utilaj_default_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_manual_zones_season_id' AND object_id = OBJECT_ID(N'snow_removal.manual_zones'))
  CREATE INDEX ix_snow_removal_manual_zones_season_id ON snow_removal.manual_zones(season_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_recipes_season_id' AND object_id = OBJECT_ID(N'snow_removal.recipes'))
  CREATE INDEX ix_snow_removal_recipes_season_id ON snow_removal.recipes(season_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_duty_logs_season_id' AND object_id = OBJECT_ID(N'snow_removal.duty_logs'))
  CREATE INDEX ix_snow_removal_duty_logs_season_id ON snow_removal.duty_logs(season_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_duty_logs_data' AND object_id = OBJECT_ID(N'snow_removal.duty_logs'))
  CREATE INDEX ix_snow_removal_duty_logs_data ON snow_removal.duty_logs(data)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_duty_logs_status' AND object_id = OBJECT_ID(N'snow_removal.duty_logs'))
  CREATE INDEX ix_snow_removal_duty_logs_status ON snow_removal.duty_logs(status)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_vehicle_route_sheets_duty_log_id' AND object_id = OBJECT_ID(N'snow_removal.vehicle_route_sheets'))
  CREATE INDEX ix_snow_removal_vehicle_route_sheets_duty_log_id ON snow_removal.vehicle_route_sheets(duty_log_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_vehicle_route_sheets_utilaj_id' AND object_id = OBJECT_ID(N'snow_removal.vehicle_route_sheets'))
  CREATE INDEX ix_snow_removal_vehicle_route_sheets_utilaj_id ON snow_removal.vehicle_route_sheets(utilaj_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_vehicle_route_sheets_status' AND object_id = OBJECT_ID(N'snow_removal.vehicle_route_sheets'))
  CREATE INDEX ix_snow_removal_vehicle_route_sheets_status ON snow_removal.vehicle_route_sheets(status)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_vehicle_route_lines_route_sheet_id' AND object_id = OBJECT_ID(N'snow_removal.vehicle_route_lines'))
  CREATE INDEX ix_snow_removal_vehicle_route_lines_route_sheet_id ON snow_removal.vehicle_route_lines(route_sheet_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_vehicle_route_lines_sector_id' AND object_id = OBJECT_ID(N'snow_removal.vehicle_route_lines'))
  CREATE INDEX ix_snow_removal_vehicle_route_lines_sector_id ON snow_removal.vehicle_route_lines(sector_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_standby_logs_duty_log_id' AND object_id = OBJECT_ID(N'snow_removal.standby_logs'))
  CREATE INDEX ix_snow_removal_standby_logs_duty_log_id ON snow_removal.standby_logs(duty_log_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_gps_tracks_route_sheet_id' AND object_id = OBJECT_ID(N'snow_removal.gps_tracks'))
  CREATE INDEX ix_snow_removal_gps_tracks_route_sheet_id ON snow_removal.gps_tracks(route_sheet_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_gps_tracks_utilaj_id' AND object_id = OBJECT_ID(N'snow_removal.gps_tracks'))
  CREATE INDEX ix_snow_removal_gps_tracks_utilaj_id ON snow_removal.gps_tracks(utilaj_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_gps_tracks_data_ora' AND object_id = OBJECT_ID(N'snow_removal.gps_tracks'))
  CREATE INDEX ix_snow_removal_gps_tracks_data_ora ON snow_removal.gps_tracks(data_ora)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_monthly_reports_season_id' AND object_id = OBJECT_ID(N'snow_removal.monthly_reports'))
  CREATE INDEX ix_snow_removal_monthly_reports_season_id ON snow_removal.monthly_reports(season_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_monthly_reports_luna' AND object_id = OBJECT_ID(N'snow_removal.monthly_reports'))
  CREATE INDEX ix_snow_removal_monthly_reports_luna ON snow_removal.monthly_reports(luna)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_sign_tokens_duty_log_id' AND object_id = OBJECT_ID(N'snow_removal.sign_tokens'))
  CREATE INDEX ix_snow_removal_sign_tokens_duty_log_id ON snow_removal.sign_tokens(duty_log_id)

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_snow_removal_sign_tokens_token' AND object_id = OBJECT_ID(N'snow_removal.sign_tokens'))
  CREATE INDEX ix_snow_removal_sign_tokens_token ON snow_removal.sign_tokens(token)

COMMIT TRANSACTION;
