$file = "C:\Program Files (x86)\InfraFlow\server\modules\system\routes.js"
$src = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$old = 'function settingSecretKey() {' + "`r`n" + '  return Buffer.from(process.env.APP_KEY || "infraflow-default-key-32chars!!", "utf8").subarray(0, 32);' + "`r`n" + '}'
$new = 'function settingSecretKey() {' + "`r`n" + '  const raw = Buffer.from(process.env.APP_KEY || "infraflow-default-key-32chars!!", "utf8");' + "`r`n" + '  return Buffer.concat([raw, Buffer.alloc(32)]).subarray(0, 32);' + "`r`n" + '}'

if ($src.Contains($old)) {
    [System.IO.File]::WriteAllText($file, $src.Replace($old, $new), [System.Text.Encoding]::UTF8)
    Write-Host "PATCH OK - key padding fix aplicat"
} else {
    # Incearca si cu LF simplu
    $old2 = 'function settingSecretKey() {' + "`n" + '  return Buffer.from(process.env.APP_KEY || "infraflow-default-key-32chars!!", "utf8").subarray(0, 32);' + "`n" + '}'
    $new2 = 'function settingSecretKey() {' + "`n" + '  const raw = Buffer.from(process.env.APP_KEY || "infraflow-default-key-32chars!!", "utf8");' + "`n" + '  return Buffer.concat([raw, Buffer.alloc(32)]).subarray(0, 32);' + "`n" + '}'
    if ($src.Contains($old2)) {
        [System.IO.File]::WriteAllText($file, $src.Replace($old2, $new2), [System.Text.Encoding]::UTF8)
        Write-Host "PATCH OK (LF) - key padding fix aplicat"
    } else {
        Write-Host "EROARE: Pattern negasit"
        $idx = $src.IndexOf("function settingSecretKey")
        Write-Host "Context la pozitia $idx :"
        Write-Host $src.Substring($idx, [Math]::Min(150, $src.Length - $idx))
    }
}
Write-Host "Gata. Apasa Enter pentru a inchide."
Read-Host
