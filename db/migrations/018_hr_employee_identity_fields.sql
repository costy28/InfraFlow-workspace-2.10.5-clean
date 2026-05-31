IF SCHEMA_ID(N'hr') IS NOT NULL AND OBJECT_ID(N'hr.employees', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'hr.employees', N'act_identitate_tip') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_tip nvarchar(30) NULL;

  IF COL_LENGTH(N'hr.employees', N'act_identitate_serie') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_serie nvarchar(5) NULL;

  IF COL_LENGTH(N'hr.employees', N'act_identitate_numar') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_numar nvarchar(10) NULL;

  IF COL_LENGTH(N'hr.employees', N'act_identitate_eliberat_de') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_eliberat_de nvarchar(200) NULL;

  IF COL_LENGTH(N'hr.employees', N'act_identitate_data_eliberare') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_data_eliberare date NULL;

  IF COL_LENGTH(N'hr.employees', N'act_identitate_valabil_pana') IS NULL
    ALTER TABLE hr.employees ADD act_identitate_valabil_pana date NULL;
END;
