/* Păstrează pachetul comercial activ la momentul deschiderii unui tichet.
   Nu schimbă tichetele istorice; acestea folosesc doar contextul licenței curente la afișare. */
IF OBJECT_ID(N'tickets.tickets', N'U') IS NOT NULL
  AND COL_LENGTH(N'tickets.tickets', N'support_package') IS NULL
BEGIN
  ALTER TABLE tickets.tickets ADD support_package NVARCHAR(30) NULL;
END
GO
