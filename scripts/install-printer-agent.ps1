[CmdletBinding()]
param(
    [string]$PrinterHost
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

if (-not $PrinterHost) {
    $ports = @(
        Get-PrinterPort -ErrorAction SilentlyContinue |
            Where-Object {
                $_.PortMonitor -like "*Epson Port Handler*" -and
                $_.Description -match '^\d{1,3}(\.\d{1,3}){3}$'
            }
    )
    if ($ports.Count -eq 1) {
        $PrinterHost = $ports[0].Description
    } elseif ($ports.Count -gt 1) {
        throw "Rilevate piu' porte Epson. Specifica l'indirizzo con -PrinterHost."
    }
}
if (-not $PrinterHost) {
    $PrinterHost = Read-Host "Indirizzo IP della stampante Epson (es. 192.168.1.222)"
}
if ($PrinterHost -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw "Indirizzo IPv4 non valido: $PrinterHost"
}
$octets = @($PrinterHost.Split(".") | ForEach-Object { [int]$_ })
if (($octets | Where-Object { $_ -lt 0 -or $_ -gt 255 }).Count -gt 0) {
    throw "Indirizzo IPv4 non valido: $PrinterHost"
}
$isPrivateAddress = $octets[0] -eq 10 `
    -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) `
    -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
if (-not $isPrivateAddress) {
    throw "Per sicurezza usa l'indirizzo privato della stampante nella rete del locale."
}

New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$json = @{ host = $PrinterHost; port = 9100 } | ConvertTo-Json
[System.IO.File]::WriteAllText(
    $configPath,
    $json,
    (New-Object System.Text.UTF8Encoding($false))
)

$client = New-Object System.Net.Sockets.TcpClient
try {
    $connection = $client.BeginConnect($PrinterHost, 9100, $null, $null)
    if ($connection.AsyncWaitHandle.WaitOne(3000)) {
        $client.EndConnect($connection)
        Write-Output "Stampante raggiungibile su ${PrinterHost}:9100."
    } else {
        Write-Warning "La stampante non risponde su ${PrinterHost}:9100. Il servizio restera' installato e ritentera'."
    }
} catch {
    Write-Warning "Connessione alla stampante non riuscita. Verifica Ethernet, indirizzo IP e rete locale."
} finally {
    $client.Close()
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq "Running") {
    throw "Il servizio e' gia' in esecuzione. Non e' stato interrotto per evitare di duplicare una stampa."
}
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
    Write-Output "Servizio installato e avviato. Stampante: $($status.printers[0].state); agente: $($status.agent.workerState)."
    Write-Output "Partira' automaticamente a ogni accesso di questo utente Windows."
} catch {
    Write-Warning "Attivazione pianificata; stato non ancora disponibile. Consulta i log in data\printer-agent*.log."
}
