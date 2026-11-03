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

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    $arguments = @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$PSCommandPath`"")
    foreach ($entry in @(
        @{ Name = "PrinterHost"; Value = $PrinterHost },
        @{ Name = "KitchenPrinterHost"; Value = $KitchenPrinterHost },
        @{ Name = "DiningPrinterHost"; Value = $DiningPrinterHost }
    )) {
        if ($entry.Value) {
            if ($entry.Value -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
                throw "Indirizzo stampante non valido: deve essere un IPv4."
            }
            $arguments += "-$($entry.Name) `"$($entry.Value)`""
        }
    }
    $elevated = Start-Process `
        -FilePath (Join-Path $PSHOME "powershell.exe") `
        -ArgumentList ($arguments -join " ") `
        -Verb RunAs `
        -Wait `
        -PassThru
    exit $elevated.ExitCode
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = $null
$toolsDirectory = Join-Path $projectRoot ".tools"
if (Test-Path -LiteralPath $toolsDirectory -PathType Container) {
    foreach ($directory in Get-ChildItem -LiteralPath $toolsDirectory -Directory -Filter "node-v22*" -ErrorAction SilentlyContinue) {
        $candidate = Join-Path $directory.FullName "node.exe"
        if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (& $candidate --version) -match '^v22\.') {
            $nodePath = $candidate
            break
        }
    }
}
if (-not $nodePath) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand -and (& $nodeCommand.Source --version) -match '^v22\.') {
        $nodeFullPath = [System.IO.Path]::GetFullPath($nodeCommand.Source)
        $userProfilePrefix = [System.IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\') + '\'
        if (-not $nodeFullPath.StartsWith($userProfilePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $nodePath = $nodeCommand.Source
        }
    }
}
if (-not $nodePath) {
    throw "Node.js 22 accessibile anche a SYSTEM non trovato. Esegui prima configura-pc-pizzeria.bat per installare il runtime portatile."
}
$serviceAccountPath = Join-Path $projectRoot "service-account.json"
$nodeModulesPath = Join-Path $projectRoot "node_modules\firebase-admin"
$configDirectory = Join-Path $projectRoot "data"
$configPath = Join-Path $configDirectory "printer-config.json"
$taskName = "GestionalePizzeriaPrinterAgent"
$runnerPath = Join-Path $PSScriptRoot "start-printer-agent.ps1"
$supervisorPath = Join-Path $PSScriptRoot "printer-agent-supervisor.js"

if (-not (Test-Path -LiteralPath $serviceAccountPath -PathType Leaf)) {
    throw "Manca service-account.json nella cartella del gestionale. La chiave resta solo su questo PC."
}
if (-not (Test-Path -LiteralPath $supervisorPath -PathType Leaf)) {
    throw "Manca scripts\printer-agent-supervisor.js. Aggiorna i file del ponte prima di installare il servizio."
}
if (-not (Test-Path -LiteralPath $nodeModulesPath -PathType Container)) {
    throw "Mancano le dipendenze Node.js. Dalla cartella del progetto esegui npm install."
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq "Running") {
    throw "L'agente e' gia' in esecuzione. Per aggiornare l'avvio automatico senza rischiare stampe duplicate, esegui prima disattiva-stampa-automatica.bat e poi rilancia questo setup."
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

$systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
$inheritanceFlags = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor `
    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$projectAcl = Get-Acl -LiteralPath $projectRoot
$projectAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $systemSid,
    [System.Security.AccessControl.FileSystemRights]::ReadAndExecute,
    $inheritanceFlags,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
)))
Set-Acl -LiteralPath $projectRoot -AclObject $projectAcl
$dataAcl = Get-Acl -LiteralPath $configDirectory
$dataAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $systemSid,
    [System.Security.AccessControl.FileSystemRights]::Modify,
    $inheritanceFlags,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
)))
Set-Acl -LiteralPath $configDirectory -AclObject $dataAcl
$credentialAcl = Get-Acl -LiteralPath $serviceAccountPath
$credentialAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $systemSid,
    [System.Security.AccessControl.FileSystemRights]::Read,
    [System.Security.AccessControl.AccessControlType]::Allow
)))
Set-Acl -LiteralPath $serviceAccountPath -AclObject $credentialAcl

if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute (Join-Path $PSHOME "powershell.exe") `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -NodePath `"$nodePath`"" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Agente stampa Gestionale Pizzeria: avvio al boot senza login e riavvio automatico."
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

& powercfg.exe /change standby-timeout-ac 0
$acPowerResult = $LASTEXITCODE
& powercfg.exe /change standby-timeout-dc 0
$dcPowerResult = $LASTEXITCODE
if ($acPowerResult -ne 0 -or $dcPowerResult -ne 0) {
    Write-Warning "Windows non ha consentito di disattivare tutte le opzioni di sospensione."
}
try {
    $adapters = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object Status -eq "Up")
    foreach ($adapter in $adapters) {
        try {
            Set-NetAdapterPowerManagement -Name $adapter.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop
            Write-Output "Risparmio energetico disattivato per la scheda $($adapter.Name)."
        } catch {
            Write-Warning "La scheda $($adapter.Name) non consente di modificare il risparmio energetico: $($_.Exception.Message)"
        }
    }
} catch {
    Write-Warning "Non e' stato possibile leggere le impostazioni di alimentazione delle schede di rete."
}

Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 3
try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/status" -TimeoutSec 10
    $printerStates = ($status.printers | ForEach-Object { "$($_.name): $($_.state)" }) -join "; "
    Write-Output "Servizio installato e avviato. Stampanti: $printerStates; agente: $($status.agent.workerState)."
    Write-Output "Partira' automaticamente all'accensione del PC anche senza accesso a Windows."
} catch {
    Write-Warning "Attivazione pianificata; stato non ancora disponibile. Consulta i log in data\printer-agent*.log."
}
