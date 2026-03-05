$ErrorActionPreference = 'Stop'

$indexPath = Join-Path $PSScriptRoot '..\index.html'
$resolvedIndexPath = Resolve-Path -Path $indexPath
$content = Get-Content -Path $resolvedIndexPath -Raw

$version = Get-Date -Format 'yyyyMMdd-HHmmssfff'

$updated = $content `
    -replace 'css/style\.css\?v=[^"]+', "css/style.css?v=$version" `
    -replace 'js/main\.js\?v=[^"]+', "js/main.js?v=$version"

if ($updated -eq $content) {
    Write-Host "No asset version tokens found in index.html; nothing to update."
    exit 0
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resolvedIndexPath, $updated, $utf8NoBom)
Write-Host "Updated asset versions to $version"
