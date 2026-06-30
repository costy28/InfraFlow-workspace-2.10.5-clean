#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$XmlPath,
  [Parameter(Mandatory = $true)][string]$XsdPath
)

$ErrorActionPreference = "Stop"
$messages = [System.Collections.Generic.List[string]]::new()
try {
  $settings = [System.Xml.XmlReaderSettings]::new()
  $resolvedXsd = (Resolve-Path -LiteralPath $XsdPath).Path
  $schemaDocument = [System.Xml.XmlDocument]::new()
  $schemaDocument.Load($resolvedXsd)
  $targetNamespace = $schemaDocument.DocumentElement.GetAttribute("targetNamespace")
  $settings.Schemas.Add($targetNamespace, $resolvedXsd) | Out-Null
  $settings.ValidationType = [System.Xml.ValidationType]::Schema
  $settings.ValidationFlags = [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
  $settings.add_ValidationEventHandler({
    param($sender, $eventArgs)
    $messages.Add($eventArgs.Message)
  })
  $reader = [System.Xml.XmlReader]::Create((Resolve-Path -LiteralPath $XmlPath).Path, $settings)
  try { while ($reader.Read()) { } } finally { $reader.Dispose() }
  $result = [ordered]@{ valid = ($messages.Count -eq 0); error_count = $messages.Count; errors = @($messages | Select-Object -First 200) }
  $result | ConvertTo-Json -Depth 4 -Compress
  if ($messages.Count -gt 0) { exit 2 }
  exit 0
} catch {
  [ordered]@{ valid = $false; error_count = 1; errors = @($_.Exception.Message) } | ConvertTo-Json -Depth 4 -Compress
  exit 3
}
