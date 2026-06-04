/*
  InfraFlow - Asigurari, ITP, taxe si ISCIR pentru flota.
  Compatibil cu instalari unde core.users.id poate fi int sau uniqueidentifier.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'fleet') EXEC(N'CREATE SCHEMA fleet');

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL AND OBJECT_ID(N'fleet.asigurari', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.asigurari (
    id int identity(1,1) not null constraint pk_fleet_asigurari primary key,
    asset_id int not null,
    tip nvarchar(30) not null,
    asigurator nvarchar(200) null,
    nr_polita nvarchar(100) null,
    valoare_prima decimal(12,2) not null constraint df_fleet_asigurari_valoare_prima default 0,
    moneda nvarchar(5) not null constraint df_fleet_asigurari_moneda default N'LEI',
    valoare_asig decimal(12,2) not null constraint df_fleet_asigurari_valoare_asig default 0,
    valabila_de_la date not null,
    perioada_luni int not null constraint df_fleet_asigurari_perioada default 12,
    data_expirarii date not null,
    notif_zile int not null constraint df_fleet_asigurari_notif default 15,
    activa bit not null constraint df_fleet_asigurari_activa default 1,
    clasa_bm nvarchar(10) null,
    carte_verde_pos nvarchar(200) null,
    carte_verde_data date null,
    fisier_path nvarchar(500) null,
    observatii nvarchar(max) null,
    created_at datetime not null constraint df_fleet_asigurari_created default getdate(),
    created_by nvarchar(64) null,
    constraint fk_fleet_asigurari_asset foreign key (asset_id) references fleet.assets(id) on delete no action,
    constraint ck_fleet_asigurari_tip check (tip in (N'RCA', N'CASCO', N'CMR', N'carte_verde', N'alta'))
  );
END;

IF OBJECT_ID(N'fleet.asigurari', N'U') IS NOT NULL AND OBJECT_ID(N'fleet.asigurari_plati', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.asigurari_plati (
    id int identity(1,1) not null constraint pk_fleet_asigurari_plati primary key,
    asigurare_id int not null,
    data_plata date not null,
    suma decimal(12,2) not null,
    moneda nvarchar(5) not null constraint df_fleet_asigurari_plati_moneda default N'LEI',
    document nvarchar(100) null,
    observatii nvarchar(300) null,
    constraint fk_fleet_asigurari_plati_asigurare foreign key (asigurare_id) references fleet.asigurari(id) on delete cascade
  );
END;

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL AND OBJECT_ID(N'fleet.itp', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.itp (
    id int identity(1,1) not null constraint pk_fleet_itp primary key,
    asset_id int not null,
    planificat_pe date not null,
    notif_zile int not null constraint df_fleet_itp_notif default 30,
    executat bit not null constraint df_fleet_itp_executat default 0,
    executat_pe date null,
    odometru_la_itp int null,
    furnizor nvarchar(200) null,
    cod_furnizor nvarchar(50) null,
    valoare_fara_tva decimal(10,2) not null constraint df_fleet_itp_valoare default 0,
    cota_tva decimal(5,2) not null constraint df_fleet_itp_tva default 19,
    valoare_tva as (valoare_fara_tva * cota_tva / 100),
    total as (valoare_fara_tva * (1 + cota_tva / 100)),
    nr_factura nvarchar(100) null,
    data_factura date null,
    data_scadenta date null,
    factura_platita bit not null constraint df_fleet_itp_factura_platita default 0,
    doc_plata nvarchar(100) null,
    nr_doc nvarchar(50) null,
    data_doc date null,
    rezultat nvarchar(10) null,
    fisier_path nvarchar(500) null,
    observatii nvarchar(max) null,
    created_at datetime not null constraint df_fleet_itp_created default getdate(),
    created_by nvarchar(64) null,
    constraint fk_fleet_itp_asset foreign key (asset_id) references fleet.assets(id) on delete no action,
    constraint ck_fleet_itp_rezultat check (rezultat is null or rezultat in (N'admis', N'respins'))
  );
END;

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL AND OBJECT_ID(N'fleet.taxe', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.taxe (
    id int identity(1,1) not null constraint pk_fleet_taxe primary key,
    asset_id int not null,
    tip nvarchar(50) not null,
    valabila_de_la date null,
    data_expirarii date null,
    notif_zile int not null constraint df_fleet_taxe_notif default 7,
    valoare decimal(10,2) not null constraint df_fleet_taxe_valoare default 0,
    moneda nvarchar(5) not null constraint df_fleet_taxe_moneda default N'LEI',
    nr_document nvarchar(100) null,
    fisier_path nvarchar(500) null,
    observatii nvarchar(300) null,
    created_at datetime not null constraint df_fleet_taxe_created default getdate(),
    constraint fk_fleet_taxe_asset foreign key (asset_id) references fleet.assets(id) on delete no action,
    constraint ck_fleet_taxe_tip check (tip in (N'rovigneta', N'taxa_pod', N'taxa_drum', N'impozit_auto', N'alta'))
  );
END;

IF OBJECT_ID(N'fleet.assets', N'U') IS NOT NULL AND OBJECT_ID(N'fleet.autorizari_iscir', N'U') IS NULL
BEGIN
  CREATE TABLE fleet.autorizari_iscir (
    id int identity(1,1) not null constraint pk_fleet_autorizari_iscir primary key,
    asset_id int not null,
    tip_autorizare nvarchar(100) not null,
    nr_autorizare nvarchar(100) null,
    data_emitere date null,
    data_expirarii date not null,
    notif_zile int not null constraint df_fleet_iscir_notif default 30,
    inspector nvarchar(200) null,
    organism nvarchar(200) null,
    fisier_path nvarchar(500) null,
    observatii nvarchar(300) null,
    created_at datetime not null constraint df_fleet_iscir_created default getdate(),
    constraint fk_fleet_iscir_asset foreign key (asset_id) references fleet.assets(id) on delete no action
  );
END;

IF OBJECT_ID(N'fleet.asigurari', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_fleet_asigurari_asset_exp' AND object_id = OBJECT_ID(N'fleet.asigurari'))
  CREATE INDEX ix_fleet_asigurari_asset_exp ON fleet.asigurari(asset_id, data_expirarii, activa);
IF OBJECT_ID(N'fleet.itp', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_fleet_itp_asset_plan' AND object_id = OBJECT_ID(N'fleet.itp'))
  CREATE INDEX ix_fleet_itp_asset_plan ON fleet.itp(asset_id, planificat_pe, executat);
IF OBJECT_ID(N'fleet.taxe', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_fleet_taxe_asset_exp' AND object_id = OBJECT_ID(N'fleet.taxe'))
  CREATE INDEX ix_fleet_taxe_asset_exp ON fleet.taxe(asset_id, data_expirarii);
IF OBJECT_ID(N'fleet.autorizari_iscir', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_fleet_iscir_asset_exp' AND object_id = OBJECT_ID(N'fleet.autorizari_iscir'))
  CREATE INDEX ix_fleet_iscir_asset_exp ON fleet.autorizari_iscir(asset_id, data_expirarii);

COMMIT TRANSACTION;
