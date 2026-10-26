[CmdletBinding()]
param(
    [string]$PrinterHost
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "GestionalePizzeriaPrinterAgent"
$credentialPath = Join-Path $projectRoot "service-account.json"

function Test-PrinterPort {
    param([string]$HostAddress)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect($HostAddress, 9100, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(3000)) {
            return $false
        }
        $client.EndConnect($pending)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-PrivateIpv4 {
    param([string]$HostAddress)
    if ($HostAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
        return $false
    }
    $octets = @($HostAddress.Split(".") | ForEach-Object { [int]$_ })
    if (($octets | Where-Object { $_ -lt 0 -or $_ -gt 255 }).Count -gt 0) {
        return $false
    }
    return $octets[0] -eq 10 `
        -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) `
        -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
}

function Get-Node22Path {
    $toolsDirectory = Join-Path $projectRoot ".tools"
    if (Test-Path -LiteralPath $toolsDirectory -PathType Container) {
        foreach ($directory in Get-ChildItem -LiteralPath $toolsDirectory -Directory -Filter "node-v22*" -ErrorAction SilentlyContinue) {
            $candidate = Join-Path $directory.FullName "node.exe"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $version = (& $candidate --version).Trim()
                if ($version -match '^v22\.') {
                    return $candidate
                }
            }
        }
    }

    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) {
        $version = (& $systemNode.Source --version).Trim()
        if ($version -match '^v22\.') {
            return $systemNode.Source
        }
    }

    $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
    if ($processor.Architecture -ne 9) {
        throw "Questo installer automatico richiede Windows a 64 bit x64."
    }

    Write-Host "Node.js 22 non trovato: scarico il runtime portatile ufficiale (senza installare driver)."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" |
        Where-Object { $_.version.StartsWith("v22.") -and $_.files -contains "win-x64-zip" } |
        Select-Object -First 1
    if (-not $release) {
        throw "Non riesco a trovare una versione Node.js 22 x64 compatibile."
    }

    $archiveName = "node-$($release.version)-win-x64.zip"
    $baseUrl = "https://nodejs.org/dist/$($release.version)"
    $temporaryArchive = Join-Path $env:TEMP $archiveName
    $temporaryDirectory = Join-Path $toolsDirectory "node-extract-$PID"
    New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
    try {
        Invoke-WebRequest -Uri "$baseUrl/$archiveName" -OutFile $temporaryArchive -UseBasicParsing
        $checksums = (Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
        $line = $checksums -split "`n" |
            Where-Object { $_ -match ("\s+\*?" + [regex]::Escape($archiveName) + "\s*$") } |
            Select-Object -First 1
        if (-not $line) {
            throw "Non trovo il checksum ufficiale dell'archivio Node.js."
        }
        $expectedHash = ($line -split '\s+')[0].Trim().ToUpperInvariant()
        $actualHash = (Get-FileHash -LiteralPath $temporaryArchive -Algorithm SHA256).Hash
        if ($actualHash -ne $expectedHash) {
            throw "Il controllo di integrita' del runtime Node.js non e' riuscito."
        }

        Expand-Archive -LiteralPath $temporaryArchive -DestinationPath $temporaryDirectory -Force
        $extractedNode = Get-ChildItem -LiteralPath $temporaryDirectory -Directory | Select-Object -First 1
        if (-not $extractedNode -or -not (Test-Path -LiteralPath (Join-Path $extractedNode.FullName "node.exe"))) {
            throw "Archivio Node.js privo del runtime atteso."
        }
        $nodeHome = Join-Path $toolsDirectory "node-v22"
        if (Test-Path -LiteralPath $nodeHome) {
            $nodeHome = Join-Path $toolsDirectory "node-v22-$($release.version.TrimStart('v'))"
        }
        Move-Item -LiteralPath $extractedNode.FullName -Destination $nodeHome
        return (Join-Path $nodeHome "node.exe")
    } finally {
        if (Test-Path -LiteralPath $temporaryArchive) {
            Remove-Item -LiteralPath $temporaryArchive -Force
        }
        if (Test-Path -LiteralPath $temporaryDirectory) {
            Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
        }
    }
}

function Ensure-ServiceAccount {
    if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = "Seleziona il file service-account.json Firebase"
        $dialog.Filter = "File JSON (*.json)|*.json"
        $dialog.CheckFileExists = $true
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            throw "Selezione credenziale annullata. Copia service-account.json sul PC e rilancia il setup."
        }
        Copy-Item -LiteralPath $dialog.FileName -Destination $credentialPath
    }

    try {
        $account = Get-Content -LiteralPath $credentialPath -Raw | ConvertFrom-Json
    } catch {
        throw "service-account.json non e' un JSON valido. Il contenuto non viene mostrato."
    }
    if ($account.type -ne "service_account" -or $account.project_id -ne "gestionalecivico7" -or -not $account.client_email -or -not $account.private_key) {
        throw "service-account.json non e' una credenziale valida per il progetto Firebase atteso."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package-lock.json"))) {
    throw "Pacchetto incompleto: package-lock.json non trovato."
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "scripts\install-printer-agent.ps1"))) {
    throw "Pacchetto incompleto: script dell'agente di stampa non trovato."
}

$runningTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($runningTask -and $runningTask.State -eq "Running") {
    Write-Host "L'agente e' gia' attivo su questo PC. Nessuna modifica eseguita."
    exit 0
}

Ensure-ServiceAccount
$nodePath = Get-Node22Path
$nodeDirectory = Split-Path -Parent $nodePath
$npmPath = Join-Path $nodeDirectory "npm.cmd"
if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
    throw "Runtime Node.js trovato ma npm.cmd non e' presente."
}
$env:PATH = "$nodeDirectory;$env:PATH"

Write-Host "Installazione delle dipendenze del gestionale..."
Push-Location $projectRoot
try {
    & $npmPath ci --omit=dev
    if ($LASTEXITCODE -ne 0) {
        throw "Installazione dipendenze fallita (codice $LASTEXITCODE)."
    }
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build del gestionale fallita (codice $LASTEXITCODE)."
    }
} finally {
    Pop-Location
}

if (-not $PrinterHost) {
    $existingPorts = @(
        Get-PrinterPort -ErrorAction SilentlyContinue |
            Where-Object {
                $_.PortMonitor -like "*Epson Port Handler*" -and
                $_.Description -match '^\d{1,3}(\.\d{1,3}){3}$'
            }
    )
    if ($existingPorts.Count -eq 1) {
        $PrinterHost = $existingPorts[0].Description
    } else {
        $PrinterHost = "192.168.1.222"
    }
}

while (-not (Test-PrivateIpv4 $PrinterHost) -or -not (Test-PrinterPort $PrinterHost)) {
    Write-Warning "Stampante non raggiungibile su $PrinterHost`:9100."
    $PrinterHost = Read-Host "Inserisci l'IP locale della Epson (porta 9100)"
}

$configPath = Join-Path $projectRoot "data\printer-config.json"
New-Item -ItemType Directory -Path (Split-Path -Parent $configPath) -Force | Out-Null
$configuration = @{ host = $PrinterHost; port = 9100 } | ConvertTo-Json
[System.IO.File]::WriteAllText(
    $configPath,
    $configuration,
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "Stampante Epson trovata su $PrinterHost`:9100. Configuro l'avvio automatico..."
& (Join-Path $PSScriptRoot "install-printer-agent.ps1") -PrinterHost $PrinterHost
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Installazione dell'attivita' automatica non riuscita."
}
