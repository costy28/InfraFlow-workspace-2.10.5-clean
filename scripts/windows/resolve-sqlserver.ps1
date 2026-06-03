#Requires -Version 5.1

function Get-InfraFlowSqlServiceName {
  param([string]$Server)

  $instance = [string]$Server
  if ($instance -notmatch '^(?:\.|localhost|[A-Za-z0-9_.-]+)(?:\\[A-Za-z0-9_$.-]+)?$') {
    throw "Nume instanta SQL invalid: $instance"
  }
  if ($instance -match '\\([^\\]+)$') {
    return "MSSQL`$$($Matches[1])"
  }
  return "MSSQLSERVER"
}

function Get-InfraFlowSqlServerName {
  param(
    [string]$PreferredServer = "",
    [string]$Database = "INFRAFLOW"
  )

  $services = @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "MSSQLSERVER" -or $_.Name -like "MSSQL`$*"
  })
  if (-not $services) {
    throw "Nu a fost gasit niciun serviciu SQL Server instalat."
  }

  $servers = @()
  if (
    -not [string]::IsNullOrWhiteSpace($PreferredServer) -and
    $PreferredServer -match '^(?:\.|localhost|[A-Za-z0-9_.-]+)(?:\\[A-Za-z0-9_$.-]+)?$'
  ) {
    $servers += $PreferredServer
  }
  foreach ($service in ($services | Sort-Object @{ Expression = { if ($_.Status -eq "Running") { 0 } else { 1 } } }, Name)) {
    if ($service.Name -eq "MSSQLSERVER") {
      $servers += "."
    } else {
      $servers += ".\$($service.Name.Substring(6))"
    }
  }
  $servers = @($servers | Select-Object -Unique)

  Add-Type -AssemblyName System.Data
  foreach ($server in $servers) {
    $connection = New-Object System.Data.SqlClient.SqlConnection(
      "Server=$server;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connection Timeout=3"
    )
    try {
      $connection.Open()
      $command = $connection.CreateCommand()
      $escapedDatabase = $Database.Replace("'", "''")
      $command.CommandText = "SELECT CASE WHEN DB_ID(N'$escapedDatabase') IS NULL THEN 0 ELSE 1 END"
      if ([int]$command.ExecuteScalar() -eq 1) {
        return $server
      }
    } catch {
      # Incercam urmatoarea instanta SQL detectata.
    } finally {
      if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
    }
  }

  foreach ($server in $servers) {
    $serviceName = Get-InfraFlowSqlServiceName -Server $server
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
      return $server
    }
  }
  return $servers[0]
}
