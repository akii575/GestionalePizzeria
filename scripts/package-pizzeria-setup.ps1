[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
    $OutputPath = Join-Path $projectRoot "pizzeria-pc-setup.zip"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) {
    throw "Il file pacchetto esiste gia': $OutputPath. Scegli un altro nome con -OutputPath."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$excludedDirectories = @(
    ".git", ".vercel", ".tools", "node_modules", "target", "public", "data", "dist"
)
$excludedFiles = @(
    ".env", ".env.local", "service-account.json", "pizzeria-pc-setup.zip"
)
$allFiles = Get-ChildItem -LiteralPath $projectRoot -File -Recurse
$includedFiles = @(
    foreach ($file in $allFiles) {
        if ($file.FullName -eq $OutputPath) {
            continue
        }
        $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart("\", "/")
        $segments = $relativePath -split '[\\/]'
        if ($segments | Where-Object { $excludedDirectories -contains $_ }) {
            continue
        }
        if ($file.Name -like ".env.*" -or $file.Name -like "service-account*.json" -or $excludedFiles -contains $file.Name -or $file.Extension -in @(".log", ".pem", ".key", ".p12", ".pfx")) {
            continue
        }
        $file
    }
)
if ($includedFiles.Count -eq 0) {
    throw "Non ci sono file sorgente da inserire nel pacchetto."
}

$stream = [System.IO.File]::Open(
    $OutputPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
)
$archive = New-Object System.IO.Compression.ZipArchive(
    $stream,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    foreach ($file in $includedFiles) {
        $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $relativePath.Replace("\", "/"),
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}

Write-Output "Pacchetto creato: $OutputPath"
Write-Output "File inclusi: $($includedFiles.Count). Le credenziali Firebase e i dati locali sono esclusi."
