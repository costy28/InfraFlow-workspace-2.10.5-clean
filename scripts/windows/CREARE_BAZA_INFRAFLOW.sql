/*
  Ruleaza in SSMS cu un cont administrator SQL Server.
  Inlocuieste SCHIMBA_PAROLA inainte de executie.
  Loginul infraflow nu primeste roluri de server si are acces numai la INFRAFLOW.
*/
USE [master];
GO

EXEC master.dbo.xp_instance_regwrite
  N'HKEY_LOCAL_MACHINE',
  N'Software\Microsoft\MSSQLServer\MSSQLServer',
  N'LoginMode',
  REG_DWORD,
  2;
GO

IF DB_ID(N'INFRAFLOW') IS NULL
  CREATE DATABASE [INFRAFLOW];
GO

IF SUSER_ID(N'infraflow') IS NULL
  CREATE LOGIN [infraflow] WITH PASSWORD = N'SCHIMBA_PAROLA', CHECK_POLICY = ON, DEFAULT_DATABASE = [INFRAFLOW];
ELSE
  ALTER LOGIN [infraflow] WITH PASSWORD = N'SCHIMBA_PAROLA', DEFAULT_DATABASE = [INFRAFLOW];
GO

USE [INFRAFLOW];
GO

IF DATABASE_PRINCIPAL_ID(N'infraflow') IS NULL
  CREATE USER [infraflow] FOR LOGIN [infraflow];
GO

IF IS_ROLEMEMBER(N'db_owner', N'infraflow') <> 1
  ALTER ROLE [db_owner] ADD MEMBER [infraflow];
GO

PRINT N'Baza INFRAFLOW si loginul dedicat au fost create. Reporniti serviciul SQL Server (SQLEXPRESS) inainte de instalarea InfraFlow.';
GO
