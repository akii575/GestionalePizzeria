$ErrorActionPreference = "Stop"
$taskName = "GestionalePizzeriaPrinterAgent"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Output "Attivita' di stampa non trovata; nessuna modifica necessaria."
    exit 0
}
if ($task.State -eq "Running") {
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
Disable-ScheduledTask -TaskName $taskName | Out-Null
Write-Output "Agente fermato e avvio automatico disabilitato. Credenziali e configurazione non sono state eliminate."
Write-Output "Attendi fino a 2 minuti per la scadenza del lock condiviso prima di affidare i job al nuovo PC."
