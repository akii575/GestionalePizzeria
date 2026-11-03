param(
    [string]$NodePath
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = $NodePath
$toolsDirectory = Join-Path $projectRoot ".tools"
if (-not $nodePath -and (Test-Path -LiteralPath $toolsDirectory -PathType Container)) {
    foreach ($directory in Get-ChildItem -LiteralPath $toolsDirectory -Directory -Filter "node-v22*" -ErrorAction SilentlyContinue) {
        $candidate = Join-Path $directory.FullName "node.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $version = (& $candidate --version).Trim()
            if ($version -match '^v22\.') {
                $nodePath = $candidate
                break
            }
        }
    }
}
if (-not $nodePath) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $nodePath = $nodeCommand.Source
    }
}
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw "Node.js non trovato: $nodePath"
}
$nodeVersion = (& $nodePath --version).Trim()
if ($nodeVersion -notmatch '^v22\.') {
    throw "Il ponte richiede Node.js 22.x; versione trovata: $nodeVersion"
}
$supervisorPath = Join-Path $PSScriptRoot "printer-agent-supervisor.js"

New-Item -ItemType Directory -Path (Join-Path $projectRoot "data") -Force | Out-Null
if (-not (Test-Path -LiteralPath $supervisorPath -PathType Leaf)) {
    throw "Supervisore di stampa non trovato: $supervisorPath"
}

& $nodePath $supervisorPath
exit $LASTEXITCODE
