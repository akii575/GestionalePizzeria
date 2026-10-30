$ErrorActionPreference = "Stop"
$taskName = "GestionalePizzeriaPrinterAgent"
$agentPath = Join-Path $PSScriptRoot "printer-terminal.js"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.State -eq "Running") {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/status" -TimeoutSec 5
    } catch {
        throw "Non riesco a verificare la coda locale. Controlla il PC e riprova; agente non fermato."
    }
    if ($status.agent.printing -gt 0) {
        throw "C'e' una comanda in stampa. Aspetta che finisca e riprova."
    }
    Stop-ScheduledTask -TaskName $taskName
}

$listeners = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
$processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $processIds) {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/status" -TimeoutSec 5
    } catch {
        throw "La porta 8765 e' occupata ma non riesco a verificare la coda. Nessun processo e' stato terminato."
    }
    if ($status.agent.printing -gt 0) {
        throw "C'e' una comanda in stampa. Aspetta che finisca e riprova."
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($process.Name -ne "node.exe" -or $process.CommandLine -notlike "*$agentPath*") {
        throw "La porta 8765 e' occupata da un processo diverso dal terminale di stampa. Nessun processo e' stato terminato."
    }
    Stop-Process -Id $processId
}

if ($task) {
    Disable-ScheduledTask -TaskName $taskName | Out-Null
} elseif ($processIds.Count -eq 0) {
    Write-Output "Attivita' e terminale di stampa non trovati; nessuna modifica necessaria."
    exit 0
}
Write-Output "Agente fermato e avvio automatico disabilitato. Credenziali e configurazione non sono state eliminate."
Write-Output "Attendi fino a 2 minuti per la scadenza del lock condiviso prima di affidare i job al nuovo PC."
