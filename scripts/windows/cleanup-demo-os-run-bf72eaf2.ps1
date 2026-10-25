# One-run recovery only; never enumerates accounts/profiles for bulk deletion.
[CmdletBinding()]
param([switch]$CleanupConfirmed)
$ErrorActionPreference='Stop'
if(-not $CleanupConfirmed){throw 'Opt-in necesar: -CleanupConfirmed. Nicio modificare.'}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'PowerShell Administrator necesar. Nicio modificare.'}
Import-Module Microsoft.PowerShell.LocalAccounts
$run='bf72eaf206b848788329d4461a4eeb66'
$root='C:\ProgramData\InfraFlow-Isolation-Test-bf72eaf206b848788329d4461a4eeb66'
$profilePath='C:\Users\IFISObf72eaf206A'
$sidA='S-1-5-21-3984578373-765403670-1964671013-1016'
$sidB='S-1-5-21-3984578373-765403670-1964671013-1017'
$expected=@{IFISObf72eaf206A=$sidA;IFISObf72eaf206B=$sidB}
$report=[ordered]@{runId=$run;profileRemoved=$false;directoryRemoved=$false;cleanup=$false;stage='preflight';error=$null;errorId=$null}
function Assert-PlainDirectory([string]$candidate,[string]$exact) {
    if([IO.Path]::GetFullPath($candidate) -cne $exact){throw 'unexpected_absolute_path'}
    $item=Get-Item -LiteralPath $candidate -Force
    if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'directory_or_reparse_refused'}
}
try {
    Assert-PlainDirectory 'C:\ProgramData' 'C:\ProgramData'
    Assert-PlainDirectory 'C:\Users' 'C:\Users'
    Assert-PlainDirectory $root $root
    # Validate entire tree without traversing reparse points, before ANY deletion.
    $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($root);$count=0
    while($pending.Count -gt 0){
        $dir=$pending.Pop();Assert-PlainDirectory $dir ([IO.Path]::GetFullPath($dir))
        foreach($item in Get-ChildItem -LiteralPath $dir -Force){
            $count++;if($count -gt 512){throw 'unexpected_fixture_size'}
            if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'fixture_reparse_refused'}
            if($item.PSIsContainer){$pending.Push($item.FullName)}
        }
    }
    $manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
    if($manifest.runId -cne $run -or $manifest.root -cne $root -or @($manifest.accounts).Count -ne 2){throw 'manifest_mismatch'}
    $seen=@{}
    foreach($account in $manifest.accounts){
        if(-not $expected.ContainsKey([string]$account.name) -or $expected[[string]$account.name] -cne $account.sid -or $seen.ContainsKey([string]$account.sid)){throw 'account_manifest_mismatch'}
        $seen[[string]$account.sid]=$true
        # Existing accounts (including renamed accounts with the same SID) block cleanup.
        $existing=Get-LocalUser -SID ([Security.Principal.SecurityIdentifier]::new([string]$account.sid)) -ErrorAction SilentlyContinue
        if($existing -or (Get-LocalUser -Name $account.name -ErrorAction SilentlyContinue)){throw 'account_still_exists'}
    }
    if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $sidA){throw 'current_profile_refused'}
    if(Get-CimInstance Win32_UserProfile -Filter "SID='$sidB'"){throw 'additional_profile_requires_review'}
    $profile=@(Get-CimInstance Win32_UserProfile -Filter "SID='$sidA'")
    if($profile.Count -gt 1){throw 'ambiguous_profile'}
    if($profile.Count -eq 1){
        if($profile[0].Loaded -ne $false -or $profile[0].Special -ne $false -or $profile[0].LocalPath -cne $profilePath){throw 'profile_state_mismatch'}
        Assert-PlainDirectory $profilePath $profilePath
        $report.stage='remove_verified_profile'
        # Delegate profile removal to Windows; no manual registry/profile-tree deletion.
        Remove-CimInstance -InputObject $profile[0] -Confirm:$false
    } elseif(Test-Path -LiteralPath $profilePath){throw 'unregistered_profile_directory_requires_review'}
    if((Get-CimInstance Win32_UserProfile -Filter "SID='$sidA'") -or (Test-Path -LiteralPath $profilePath)){throw 'profile_cleanup_incomplete'}
    $report.profileRemoved=$true
    $report.stage='remove_verified_fixture'
    Assert-PlainDirectory $root $root
    Remove-Item -LiteralPath $root -Recurse -Force
    $report.directoryRemoved=-not(Test-Path -LiteralPath $root)
    $report.cleanup=$report.profileRemoved -and $report.directoryRemoved
    $report.stage='completed'
} catch {$report.error=$_.Exception.GetBaseException().GetType().Name;$report.errorId=$_.FullyQualifiedErrorId}
$report | ConvertTo-Json
if(-not $report.cleanup){exit 1}
