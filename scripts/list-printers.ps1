$ErrorActionPreference = "Stop"

$defaults = @{}
foreach ($printer in Get-CimInstance -ClassName Win32_Printer) {
    $defaults[$printer.Name] = [bool]$printer.Default
}

$printers = @(
    Get-Printer | Select-Object `
        @{ Name = "name"; Expression = { $_.Name } }, `
        @{ Name = "isDefault"; Expression = { [bool]$defaults[$_.Name] } }, `
        @{ Name = "isVirtual"; Expression = {
            $_.Name -match '^(Microsoft Print to PDF|Microsoft XPS Document Writer|Fax)$' `
                -or $_.DriverName -match 'Microsoft Print To PDF|Microsoft XPS Document Writer'
        } }, `
        @{ Name = "status"; Expression = { [string]$_.PrinterStatus } }
)

ConvertTo-Json -InputObject $printers -Depth 3 -Compress
