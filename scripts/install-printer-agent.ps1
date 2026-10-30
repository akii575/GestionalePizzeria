[CmdletBinding()]
param(
    [string]$PrinterHost,
    [string]$KitchenPrinterHost,
    [string]$DiningPrinterHost,
    [ValidateSet(58, 80)]
    [int]$KitchenPaperWidthMm = 80,
    [ValidateSet(58, 80)]
    [int]$DiningPaperWidthMm = 80
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$serviceAccountPath = Join-Path $projectRoot "service-account.json"
$nodeModulesPath = Join-Path $projectRoot "node_modules\firebase-admin"
$configDirectory = Join-Path $projectRoot "data"
$configPath = Join-Path $configDirectory "printer-config.json"
$taskName = "GestionalePizzeriaPrinterAgent"
$runnerPath = Join-Path $PSScriptRoot "start-printer-agent.ps1"
$agentPath = Join-Path $PSScriptRoot "printer-terminal.js"

if (-not (Test-Path -LiteralPath $serviceAccountPath -PathType Leaf)) {
    throw "Manca service-account.json nella cartella del gestionale. La chiave resta solo su questo PC."
}
if (-not (Test-Path -LiteralPath $nodeModulesPath -PathType Container)) {
    throw "Mancano le dipendenze Node.js. Dalla cartella del progetto esegui npm install."
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq "Running") {
    throw "Il servizio e' gia' in esecuzione. Non e' stato interrotto per evitare di duplicare una stampa."
}
$existingListener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
    throw "La porta 8765 e' gia' occupata. Esegui prima disattiva-stampa-automatica.bat per arrestare anche un eventuale processo residuo."
}

if (-not $KitchenPrinterHost) {
    $KitchenPrinterHost = $PrinterHost
}
$ports = @(
    Get-PrinterPort -ErrorAction SilentlyContinue |
        Where-Object {
            $_.PortMonitor -like "*Epson Port Handler*" -and
            $_.Description -match '^\d{1,3}(\.\d{1,3}){3}$'
        }
)
if (-not $KitchenPrinterHost -and $ports.Count -gt 0) {
    $KitchenPrinterHost = $ports[0].Description
}
if (-not $DiningPrinterHost -and $ports.Count -gt 1) {
    $DiningPrinterHost = $ports[1].Description
}
if (-not $KitchenPrinterHost) {
    $KitchenPrinterHost = Read-Host "Indirizzo IP locale della stampante Cucina (es. 192.168.1.222)"
}
if (-not $DiningPrinterHost) {
    $DiningPrinterHost = Read-Host "Indirizzo IP locale della stampante Sala"
}
if ($KitchenPrinterHost -eq $DiningPrinterHost) {
    throw "Le stampanti di cucina e sala devono avere indirizzi IP diversi."
}

$printerTargets = @(
    @{ name = "Cucina"; host = $KitchenPrinterHost; paperWidthMm = $KitchenPaperWidthMm },
    @{ name = "Sala"; host = $DiningPrinterHost; paperWidthMm = $DiningPaperWidthMm }
)
foreach ($printer in $printerTargets) {
    if ($printer.host -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
        throw "Indirizzo IPv4 non valido per la stampante $($printer.name): $($printer.host)"
    }
    $octets = @($printer.host.Split(".") | ForEach-Object { [int]$_ })
    if (($octets | Where-Object { $_ -lt 0 -or $_ -gt 255 }).Count -gt 0) {
        throw "Indirizzo IPv4 non valido per la stampante $($printer.name): $($printer.host)"
    }
    $isPrivateAddress = $octets[0] -eq 10 `
        -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) `
        -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
    if (-not $isPrivateAddress) {
        throw "Per sicurezza usa l'indirizzo privato della stampante $($printer.name) nella rete del locale."
    }

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $client.BeginConnect($printer.host, 9100, $null, $null)
        if ($connection.AsyncWaitHandle.WaitOne(3000)) {
            $client.EndConnect($connection)
            Write-Output "Stampante $($printer.name) raggiungibile su $($printer.host):9100."
        } else {
            Write-Warning "La stampante $($printer.name) non risponde su $($printer.host):9100. Verifica rete e indirizzo."
        }
    } catch {
        Write-Warning "Connessione alla stampante $($printer.name) non riuscita. Verifica Ethernet, IP e rete locale."
    } finally {
        $client.Close()
    }
}

New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$json = @{ printers = $printerTargets; port = 9100 } | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText(
    $configPath,
    $json,
    (New-Object System.Text.UTF8Encoding($false))
)

if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute (Join-Path $PSHOME "powershell.exe") `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`"" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Riceve le comande Firestore e le stampa via Ethernet senza driver Windows."
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 2
try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/status" -TimeoutSec 10
    $printerStates = ($status.printers | ForEach-Object { "$($_.name): $($_.state)" }) -join "; "
    Write-Output "Servizio installato e avviato. Stampanti: $printerStates; agente: $($status.agent.workerState)."
    Write-Output "Partira' automaticamente a ogni accesso di questo utente Windows."
} catch {
    Write-Warning "Attivazione pianificata; stato non ancora disponibile. Consulta i log in data\printer-agent*.log."
}
