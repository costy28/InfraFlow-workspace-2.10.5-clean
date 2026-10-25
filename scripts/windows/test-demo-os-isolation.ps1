# Dedicated, opt-in fixture. Run only from an Administrator PowerShell.
[CmdletBinding()]
param([switch]$RunIsolatedTest)
$ErrorActionPreference = 'Stop'
if (-not $RunIsolatedTest) { throw 'Opt-in necesar: -RunIsolatedTest. Nu s-a modificat nimic.' }
$who = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $who.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'PowerShell Administrator necesar. Nu s-a modificat nimic.' }
if (-not [Environment]::Is64BitProcess) { throw 'Proces 64-bit necesar.' }
Import-Module Microsoft.PowerShell.LocalAccounts
$run = [Guid]::NewGuid().ToString('N')
$description = 'IFISO ' + $run
$descriptionLimit = (Get-Command New-LocalUser).Parameters['Description'].Attributes |
    Where-Object { $_ -is [System.Management.Automation.ValidateLengthAttribute] }
if (-not $descriptionLimit -or $description.Length -gt $descriptionLimit.MaxLength) { throw 'fixture_description_invalid_before_setup' }
$parent = [IO.Path]::GetFullPath([Environment]::GetFolderPath('CommonApplicationData')).TrimEnd('\')
$root = Join-Path $parent ('InfraFlow-Isolation-Test-' + $run)
$rootCreated = $false
$accounts = [Collections.Generic.List[object]]::new()
$processes = [Collections.Generic.List[object]]::new()
$problems = [Collections.Generic.List[string]]::new()
$report = [ordered]@{ runId=$run; root=$root; stage='setup'; passed=$false; cleanup=$false; profilesRemaining=@(); error=$null; errorType=$null; errorLine=$null; failedCommand=$null; errorId=$null; hresult=$null; nativeError=$null; launchLength=$null; childExitCode=$null; childDiagnostic=$null; results=@() }
$adminSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
function Protect-Directory([string]$directory, $sid, [string]$rights='ReadAndExecute') {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    $acl.SetOwner($adminSid)
    foreach ($principal in @($adminSid,$systemSid)) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    if ($null -ne $sid) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,$rights,'ContainerInherit,ObjectInherit','None','Allow')) }
    Set-Acl -LiteralPath $directory -AclObject $acl
}
function Save-Manifest {
    $data = [ordered]@{ runId=$run; root=$root; accounts=@($accounts | ForEach-Object { @{name=$_.name;sid=$_.sid.Value} }) }
    $data | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'manifest.json') -Encoding UTF8
}
try {
    if (Test-Path -LiteralPath $root) { throw 'fixture_collision' }
    # Parent must not redirect the fixture outside the intended directory.
    if ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'parent_reparse_refused' }
    [void](New-Item -ItemType Directory -Path $root)
    $rootCreated = $true
    Protect-Directory $root $null
    Save-Manifest
    foreach ($side in @('A','B')) {
        $report.stage='create_account_'+$side
        $name = 'IFISO' + $run.Substring(0,10) + $side
        if (Get-LocalUser -Name $name -ErrorAction SilentlyContinue) { throw 'account_collision' }
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $plain = [Convert]::ToBase64String($bytes) + 'aA1!'
        $secret = ConvertTo-SecureString $plain -AsPlainText -Force
        $plain = $null; [Array]::Clear($bytes,0,$bytes.Length)
        $user = New-LocalUser -Name $name -Password $secret -Description $description -AccountExpires (Get-Date).AddDays(1)
        $entry = [pscustomobject]@{name=$name;sid=$user.SID;side=$side;credential=[PSCredential]::new(($env:COMPUTERNAME+'\'+$name),$secret)}
        $accounts.Add($entry); Save-Manifest
        $report.stage='add_standard_group_'+$side
        Add-LocalGroupMember -SID ([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')) -Member $user.SID.Value
        $report.stage='prepare_acl_'+$side
        $base = Join-Path $root $side
        [void](New-Item -ItemType Directory -Path $base)
        Protect-Directory $base $entry.sid
        foreach ($folder in @('storage','keys','result')) {
            $dir = Join-Path $base $folder; [void](New-Item -ItemType Directory -Path $dir)
            $right = if ($folder -eq 'keys') {'ReadAndExecute'} else {'Modify'}
            Protect-Directory $dir $entry.sid $right
        }
        [IO.File]::WriteAllText((Join-Path $base 'storage\canary.txt'),'CANARY-'+$side)
        [IO.File]::WriteAllText((Join-Path $base 'keys\key.txt'),'SYNTHETIC-KEY-'+$side)
    }
    $backups = Join-Path $root 'backups'; [void](New-Item -ItemType Directory -Path $backups)
    Protect-Directory $backups $null
    [IO.File]::WriteAllText((Join-Path $backups 'canary.txt'),'SYNTHETIC-BACKUP')
    # Only traversal/read of the root, not write; subtree ACLs remain protected.
    $acl = Get-Acl -LiteralPath $root
    foreach ($entry in $accounts) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($entry.sid,'ReadAndExecute','None','None','Allow')) }
    Set-Acl -LiteralPath $root -AclObject $acl
    foreach ($entry in $accounts) {
        $side=$entry.side; $neighbor=if($side -eq 'A'){'B'}else{'A'}
        $report.stage='launch_probe_'+$side
        $child = @'
param([string]$root,[string]$side,[string]$neighbor,[string]$expectedSid)
$ErrorActionPreference='Stop'
function Denied([scriptblock]$action) {
  try { & $action } catch {
    if($_.Exception.GetBaseException() -is [UnauthorizedAccessException]){return}
    throw 'unexpected_failure_category'
  }
  throw 'access_should_be_denied'
}
$result=@{passed=$false;sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;negative=0;positive=0;error=$null}
try {
  if($result.sid -ne $expectedSid){throw 'wrong_identity'}
  if([IO.File]::ReadAllText((Join-Path $root "$side\storage\canary.txt")) -ne "CANARY-$side"){throw 'own_read_failed'}
  $result.positive++
  [IO.File]::WriteAllText((Join-Path $root "$side\storage\own-write.txt"),'own')
  $result.positive++
  if([IO.File]::ReadAllText((Join-Path $root "$side\keys\key.txt")) -ne "SYNTHETIC-KEY-$side"){throw 'own_key_failed'}
  $result.positive++
  Denied { [IO.File]::WriteAllText((Join-Path $root "$side\keys\key.txt"),'blocked') }; $result.negative++
  foreach($relative in @("$neighbor\storage\canary.txt","$neighbor\keys\key.txt",'backups\canary.txt')) {
    $target=Join-Path $root $relative
    Denied { [void][IO.File]::ReadAllText($target) }; $result.negative++
    Denied { [IO.File]::WriteAllText($target,'blocked') }; $result.negative++
  }
  $result.passed=$true
} catch {$result.error='os_isolation_probe_failed'}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root "$side\result\result.json") -Encoding UTF8
if(-not $result.passed){exit 2}
'@
        # Keep the credentialed command line short; code stays in an admin-owned file.
        $probeFile = Join-Path $root ('probe-'+$side+'.ps1')
        [IO.File]::WriteAllText($probeFile,$child)
        $fileAcl=[Security.AccessControl.FileSecurity]::new()
        $fileAcl.SetAccessRuleProtection($true,$false);$fileAcl.SetOwner($adminSid)
        foreach($sid in @($adminSid,$systemSid)) {
            $fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
        }
        $fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($entry.sid,'ReadAndExecute','Allow'))
        Set-Acl -LiteralPath $probeFile -AclObject $fileAcl
        $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = '-NoProfile -NonInteractive -File "'+$probeFile+'" -root "'+$root+'" -side '+$side+' -neighbor '+$neighbor+' -expectedSid '+$entry.sid.Value
        $report.launchLength=$exe.Length+$arguments.Length+4
        if($report.launchLength -ge 1024){throw 'credential_command_too_long'}
        $stderrFile=Join-Path $root "$side\result\stderr.txt"
        $stdoutFile=Join-Path $root "$side\result\stdout.txt"
        $process = Start-Process -FilePath $exe -ArgumentList $arguments -Credential $entry.credential -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError $stderrFile -RedirectStandardOutput $stdoutFile -PassThru
        $processes.Add($process)
        if (-not $process.WaitForExit(30000)) { $process.Kill(); $process.WaitForExit(); throw 'child_timeout' }
        $process.WaitForExit()
        $report.childExitCode=$process.ExitCode
        if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $root "$side\result\result.json"))) {
            # Only fixed diagnostic categories enter the report; raw output remains protected.
            $stderr=if(Test-Path -LiteralPath $stderrFile){[IO.File]::ReadAllText($stderrFile)}else{''}
            $report.childDiagnostic=if($stderr -match 'PSSecurityException|UnauthorizedAccess|ExecutionPolicy|running scripts is disabled'){'script_start_security_error'}elseif($stderr.Length -gt 0){'child_stderr_present'}else{'no_child_result_or_stderr'}
            throw 'child_probe_failed'
        }
        $result = Get-Content -LiteralPath (Join-Path $root "$side\result\result.json") -Raw | ConvertFrom-Json
        if (-not $result.passed -or $result.sid -ne $entry.sid.Value -or $result.negative -ne 7 -or $result.positive -ne 3) { throw 'invalid_child_result' }
        $report.results += @{side=$side;positive=3;negative=7;identityVerified=$true}
    }
    foreach ($side in @('A','B')) {
        if ([IO.File]::ReadAllText((Join-Path $root "$side\storage\canary.txt")) -ne "CANARY-$side" -or
            [IO.File]::ReadAllText((Join-Path $root "$side\keys\key.txt")) -ne "SYNTHETIC-KEY-$side") { throw 'canary_changed' }
    }
    if ([IO.File]::ReadAllText((Join-Path $backups 'canary.txt')) -ne 'SYNTHETIC-BACKUP') { throw 'backup_changed' }
    $report.passed=$true
    $report.stage='completed'
} catch {
    $report.error='fixture_failed_no_policy_changes'
    $cause=$_.Exception.GetBaseException();$report.errorType=$cause.GetType().Name
    $report.errorLine=$_.InvocationInfo.ScriptLineNumber
    # Command name and line number only, never source text/arguments containing secrets.
    $report.failedCommand=$_.InvocationInfo.MyCommand.Name
    $report.errorId=$_.FullyQualifiedErrorId
    $report.hresult=$cause.HResult
    if($cause -is [ComponentModel.Win32Exception]){$report.nativeError=$cause.NativeErrorCode}
}
finally {
    foreach ($process in $processes) {
        try { if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }; $process.Dispose() } catch { $problems.Add('process_cleanup_failed') }
    }
    foreach ($entry in $accounts) {
        try {
            $current=Get-LocalUser -Name $entry.name -ErrorAction SilentlyContinue
            if ($current -and $current.SID.Value -ne $entry.sid.Value) { throw 'sid_changed' }
            if ($current) { Remove-LocalUser -SID $entry.sid }
            if (Get-LocalUser -Name $entry.name -ErrorAction SilentlyContinue) { throw 'account_remains' }
        } catch { $problems.Add('account_cleanup_failed') }
        try {
            $profile=Get-CimInstance Win32_UserProfile -Filter "SID='$($entry.sid.Value)'"
            if ($profile) { $report.profilesRemaining += $entry.sid.Value; $problems.Add('profile_requires_review') }
        } catch { $problems.Add('profile_inventory_failed') }
    }
    try {
        if ($rootCreated -and (Test-Path -LiteralPath $root)) {
            $resolved=[IO.Path]::GetFullPath($root)
            if ($resolved -ne (Join-Path $parent ('InfraFlow-Isolation-Test-'+$run))) { throw 'unsafe_cleanup_path' }
            # Never recurse into a junction/symlink; scan one directory level at a time.
            $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($root)
            while($pending.Count -gt 0) {
                $dir=$pending.Pop();$item=Get-Item -LiteralPath $dir -Force
                if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'cleanup_reparse_refused'}
                foreach($item in Get-ChildItem -LiteralPath $dir -Force) {
                    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'cleanup_reparse_refused'}
                    if($item.PSIsContainer){$pending.Push($item.FullName)}
                }
            }
            if ($problems.Count -eq 0) { Remove-Item -LiteralPath $resolved -Recurse -Force }
        }
    } catch { $problems.Add('directory_cleanup_failed') }
    $report.cleanup=($problems.Count -eq 0 -and (-not $rootCreated -or -not (Test-Path -LiteralPath $root)))
    if (-not $report.cleanup -and $rootCreated -and (Test-Path -LiteralPath $root)) { Save-Manifest }
    $report['cleanupIssues']=@($problems.ToArray())
}
$report | ConvertTo-Json -Depth 5
if (-not $report.passed -or -not $report.cleanup) { exit 1 }
