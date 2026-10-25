# Read-only prerequisite check. Does not create accounts, change ACLs or elevate.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Aceasta verificare necesita Windows.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$localAccounts = [bool](Get-Module -ListAvailable Microsoft.PowerShell.LocalAccounts)
$credentialLaunch = (Get-Command Start-Process).Parameters.ContainsKey('Credential')
$aclTool = [bool](Get-Command icacls -ErrorAction SilentlyContinue)
$blockers = [Collections.Generic.List[string]]::new()
if (-not $elevated) { $blockers.Add('administrator_context_required') }
if (-not [Environment]::Is64BitProcess) { $blockers.Add('64bit_process_required') }
if (-not $localAccounts) { $blockers.Add('local_accounts_module_missing') }
if (-not $credentialLaunch) { $blockers.Add('credential_launch_unavailable') }
if (-not $aclTool) { $blockers.Add('acl_tool_missing') }
[ordered]@{
    format = 'infraflow-demo-os-isolation-prerequisites-v1'
    readOnly = $true
    elevated = $elevated
    is64BitProcess = [Environment]::Is64BitProcess
    localAccountsModule = $localAccounts
    credentialLaunchAvailable = $credentialLaunch
    aclToolAvailable = $aclTool
    prerequisitesPresent = ($blockers.Count -eq 0)
    isolationVerified = $false
    mutationsAuthorized = $false
    blockers = @($blockers.ToArray())
    limits = @('logon_policy_not_tested', 'filesystem_acl_not_tested', 'distinct_identities_not_created')
} | ConvertTo-Json -Depth 3
