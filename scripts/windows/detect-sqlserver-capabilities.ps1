#Requires -Version 5.1

function Get-InfraFlowSqlCapabilities {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Server,
    [System.Data.SqlClient.SqlConnection]$Connection
  )

  Add-Type -AssemblyName System.Data
  $ownsConnection = $false
  if (-not $Connection) {
    $Connection = New-Object System.Data.SqlClient.SqlConnection(
      "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connection Timeout=10"
    )
    $Connection.Open()
    $ownsConnection = $true
  }

  try {
    $command = $Connection.CreateCommand()
    $command.CommandText = @"
SELECT
  CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS product_version,
  CAST(SERVERPROPERTY('Edition') AS nvarchar(256)) AS edition,
  CAST(SERVERPROPERTY('EngineEdition') AS int) AS engine_edition;
"@
    $reader = $command.ExecuteReader()
    try {
      if (-not $reader.Read()) { throw "SQL Server nu a returnat informatiile despre versiune." }
      $productVersion = [string]$reader["product_version"]
      $edition = [string]$reader["edition"]
      $engineEdition = [int]$reader["engine_edition"]
    } finally {
      $reader.Close()
    }
  } finally {
    if ($ownsConnection -and $Connection.State -ne [System.Data.ConnectionState]::Closed) {
      $Connection.Close()
    }
  }

  $majorVersion = 0
  if ($productVersion -match '^(\d+)') { $majorVersion = [int]$Matches[1] }
  if ($majorVersion -lt 1) { throw "Versiune SQL Server invalida: $productVersion" }

  $supportsJson = $majorVersion -ge 13
  [PSCustomObject]@{
    Server = $Server
    ProductVersion = $productVersion
    MajorVersion = $majorVersion
    Edition = $edition
    EngineEdition = $engineEdition
    SupportsJson = $supportsJson
    Profile = $(if ($supportsJson) { "modern" } else { "legacy" })
    RelationalMode = "0"
  }
}

