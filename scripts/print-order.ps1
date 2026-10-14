param(
    [Parameter(Mandatory = $true)]
    [string]$PrinterName,
    [Parameter(Mandatory = $true)]
    [string]$ReceiptPath
)

$ErrorActionPreference = "Stop"
Get-Printer -Name $PrinterName -ErrorAction Stop | Out-Null
$receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 -ErrorAction Stop
$receipt | Out-Printer -Name $PrinterName -ErrorAction Stop
