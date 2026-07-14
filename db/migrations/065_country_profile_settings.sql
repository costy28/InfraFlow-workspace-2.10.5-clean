IF OBJECT_ID(N'core.app_settings', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'core.app_settings', N'locale') IS NULL
    ALTER TABLE core.app_settings ADD locale NVARCHAR(20) NULL;

  IF COL_LENGTH(N'core.app_settings', N'language') IS NULL
    ALTER TABLE core.app_settings ADD [language] NVARCHAR(20) NULL;

  IF COL_LENGTH(N'core.app_settings', N'country') IS NULL
    ALTER TABLE core.app_settings ADD country NVARCHAR(10) NULL;

  IF COL_LENGTH(N'core.app_settings', N'currency') IS NULL
    ALTER TABLE core.app_settings ADD currency NVARCHAR(10) NULL;

  IF COL_LENGTH(N'core.app_settings', N'timezone') IS NULL
    ALTER TABLE core.app_settings ADD timezone NVARCHAR(80) NULL;

  IF COL_LENGTH(N'core.app_settings', N'jurisdiction_profile') IS NULL
    ALTER TABLE core.app_settings ADD jurisdiction_profile NVARCHAR(20) NULL;

  UPDATE core.app_settings
  SET
    locale = COALESCE(NULLIF(locale, N''), NULLIF([language], N''), N'ro-RO'),
    [language] = COALESCE(NULLIF([language], N''), NULLIF(locale, N''), N'ro-RO'),
    country = COALESCE(NULLIF(country, N''), N'RO'),
    currency = COALESCE(NULLIF(currency, N''), N'RON'),
    timezone = COALESCE(NULLIF(timezone, N''), N'Europe/Bucharest'),
    jurisdiction_profile = COALESCE(NULLIF(jurisdiction_profile, N''), NULLIF(country, N''), N'RO');
END;
