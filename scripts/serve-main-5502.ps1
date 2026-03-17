$ErrorActionPreference = 'Stop'

$mainRoot = [string](Resolve-Path (Join-Path $PSScriptRoot '..\..\CWD Site'))
$port = 5502
$hostName = '127.0.0.1'
$url = "http://${hostName}:$port/"

$contentTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.gif' = 'image/gif'
    '.htm' = 'text/html; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.jpeg' = 'image/jpeg'
    '.jpg' = 'image/jpeg'
    '.js' = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.txt' = 'text/plain; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.webp' = 'image/webp'
    '.xml' = 'application/xml; charset=utf-8'
}

function Get-ContentType($path) {
    $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($contentTypes.ContainsKey($extension)) {
        return $contentTypes[$extension]
    }
    return 'application/octet-stream'
}

function Resolve-RequestPath($basePath, $requestPath) {
    $localPath = [System.Uri]::UnescapeDataString(($requestPath -split '\?')[0]).TrimStart('/')

    if ([string]::IsNullOrWhiteSpace($localPath)) {
        $localPath = 'index.html'
    }

    $candidate = Join-Path $basePath $localPath.Replace('/', '\')

    if (Test-Path $candidate -PathType Container) {
        $candidate = Join-Path $candidate 'index.html'
    }

    $resolved = [System.IO.Path]::GetFullPath($candidate)
    $resolvedBase = [System.IO.Path]::GetFullPath($basePath)

    if (-not $resolved.StartsWith($resolvedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Blocked path traversal attempt.'
    }

    return $resolved
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($url)
$listener.Start()

Write-Host "Serving main workspace from $mainRoot on $url"
Write-Host "Press Ctrl+C to stop."

Start-Job -ScriptBlock {
    param($targetUrl)
    Start-Sleep -Milliseconds 700
    Start-Process 'msedge.exe' $targetUrl
} -ArgumentList $url | Out-Null

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            if ($request.HttpMethod -notin @('GET', 'HEAD')) {
                $response.StatusCode = 405
                $response.Close()
                continue
            }

            $filePath = Resolve-RequestPath -basePath $mainRoot -requestPath $request.RawUrl
            if (-not (Test-Path $filePath -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                $response.ContentType = 'text/plain; charset=utf-8'
                $response.ContentLength64 = $bytes.Length
                if ($request.HttpMethod -ne 'HEAD') {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
                $response.Close()
                continue
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.StatusCode = 200
            $response.ContentType = Get-ContentType $filePath
            $response.ContentLength64 = $bytes.Length
            if ($request.HttpMethod -ne 'HEAD') {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            $response.Close()
        } catch {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Server Error')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            if ($request.HttpMethod -ne 'HEAD') {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
