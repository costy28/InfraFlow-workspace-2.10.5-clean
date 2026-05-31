IF SCHEMA_ID(N'inventory') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA inventory')
END

IF SCHEMA_ID(N'work') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA work')
END

IF SCHEMA_ID(N'procurement') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA procurement')
END

IF OBJECT_ID(N'inventory.department_stocks', N'U') IS NULL
BEGIN
  CREATE TABLE inventory.department_stocks (
    id INT IDENTITY(1,1) PRIMARY KEY,
    material_id NVARCHAR(80) NOT NULL,
    department_cod NVARCHAR(80) NOT NULL,
    cantitate DECIMAL(18,3) NOT NULL DEFAULT 0,
    ultima_actualizare DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  )
END

IF OBJECT_ID(N'inventory.stock_transfers', N'U') IS NULL
BEGIN
  CREATE TABLE inventory.stock_transfers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    material_id NVARCHAR(80) NOT NULL,
    cantitate DECIMAL(18,3) NOT NULL,
    from_department NVARCHAR(80) NULL,
    to_department NVARCHAR(80) NOT NULL,
    motiv NVARCHAR(500) NULL,
    creat_de NVARCHAR(80) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    status NVARCHAR(30) NOT NULL DEFAULT N'pending'
  )
END

IF OBJECT_ID(N'inventory.department_consumptions', N'U') IS NULL
BEGIN
  CREATE TABLE inventory.department_consumptions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    material_id NVARCHAR(80) NOT NULL,
    department_cod NVARCHAR(80) NOT NULL,
    cantitate DECIMAL(18,3) NOT NULL,
    lucrare_id NVARCHAR(80) NULL,
    motiv NVARCHAR(500) NULL,
    creat_de NVARCHAR(80) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  )
END

IF OBJECT_ID(N'work.orders', N'U') IS NULL
BEGIN
  CREATE TABLE work.orders (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    titlu NVARCHAR(300) NOT NULL,
    descriere NVARCHAR(MAX) NULL,
    tip NVARCHAR(50) NULL,
    data_start DATE NULL,
    data_termen DATE NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N'in_lucru',
    creat_de NVARCHAR(80) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  )
END

IF OBJECT_ID(N'work.order_departments', N'U') IS NULL
BEGIN
  CREATE TABLE work.order_departments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    order_id INT NOT NULL,
    department_cod NVARCHAR(80) NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N'primit',
    ore_estimate DECIMAL(8,2) NULL,
    ore_efectuate DECIMAL(8,2) NULL,
    observatii NVARCHAR(MAX) NULL,
    finalizat_la DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_work_order_departments_order FOREIGN KEY (order_id) REFERENCES work.orders(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'work.order_materials', N'U') IS NULL
BEGIN
  CREATE TABLE work.order_materials (
    id INT IDENTITY(1,1) PRIMARY KEY,
    order_id INT NOT NULL,
    department_cod NVARCHAR(80) NOT NULL,
    material_id NVARCHAR(80) NOT NULL,
    cantitate DECIMAL(18,3) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_work_order_materials_order FOREIGN KEY (order_id) REFERENCES work.orders(id) ON DELETE NO ACTION
  )
END

IF OBJECT_ID(N'procurement.annual_plans', N'U') IS NULL
BEGIN
  CREATE TABLE procurement.annual_plans (
    id INT IDENTITY(1,1) PRIMARY KEY,
    an INT NOT NULL,
    date_json NVARCHAR(MAX) NOT NULL,
    created_by NVARCHAR(80) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  )
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_inventory_department_stocks_dept' AND object_id = OBJECT_ID(N'inventory.department_stocks'))
BEGIN
  CREATE INDEX IX_inventory_department_stocks_dept ON inventory.department_stocks(department_cod, material_id)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_inventory_stock_transfers_uuid' AND object_id = OBJECT_ID(N'inventory.stock_transfers'))
BEGIN
  CREATE INDEX IX_inventory_stock_transfers_uuid ON inventory.stock_transfers(uuid)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_work_orders_uuid_status' AND object_id = OBJECT_ID(N'work.orders'))
BEGIN
  CREATE INDEX IX_work_orders_uuid_status ON work.orders(uuid, status)
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_work_order_departments_dept' AND object_id = OBJECT_ID(N'work.order_departments'))
BEGIN
  CREATE INDEX IX_work_order_departments_dept ON work.order_departments(department_cod, status)
END
