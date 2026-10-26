$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = $null
$toolsDirectory = Join-Path $projectRoot ".tools"
if (Test-Path -LiteralPath $toolsDirectory -PathType Container) {
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
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
$agentPath = Join-Path $PSScriptRoot "printer-terminal.js"
$outputLog = Join-Path $projectRoot "data\printer-agent.out.log"
$errorLog = Join-Path $projectRoot "data\printer-agent.err.log"

New-Item -ItemType Directory -Path (Join-Path $projectRoot "data") -Force | Out-Null
$process = Start-Process `
    -FilePath $nodePath `
    -ArgumentList "`"$agentPath`"" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outputLog `
    -RedirectStandardError $errorLog `
    -Wait `
    -PassThru
exit $process.ExitCode
