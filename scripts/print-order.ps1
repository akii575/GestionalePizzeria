[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$PrinterName,
    [Parameter(Mandatory = $true)]
    [string]$ReceiptPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$printerSettings = New-Object System.Drawing.Printing.PrinterSettings
$printerSettings.PrinterName = $PrinterName
if (-not $printerSettings.IsValid) {
    throw "La stampante '$PrinterName' non è disponibile."
}

$paperSize = $printerSettings.PaperSizes |
    Where-Object { $_.PaperName -eq "Roll Paper 80 x 297 mm" } |
    Select-Object -First 1
if (-not $paperSize) {
    throw "Il driver Epson non espone il formato 'Roll Paper 80 x 297 mm'."
}

$lines = [System.IO.File]::ReadAllLines($ReceiptPath, [System.Text.Encoding]::UTF8)
$font = New-Object System.Drawing.Font(
    "Consolas",
    12,
    [System.Drawing.FontStyle]::Regular,
    [System.Drawing.GraphicsUnit]::Point
)
$sectionFont = New-Object System.Drawing.Font(
    "Consolas",
    16,
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Point
)
$measureBitmap = New-Object System.Drawing.Bitmap(1, 1)
$measureGraphics = [System.Drawing.Graphics]::FromImage($measureBitmap)
$measureGraphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
try {
    $printableWidth = $printerSettings.DefaultPageSettings.PrintableArea.Width
    foreach ($line in $lines) {
        $sectionMatch = [regex]::Match($line, '^@@SECTION:(.*)@@$')
        $text = if ($sectionMatch.Success) { $sectionMatch.Groups[1].Value } else { $line }
        $lineFont = if ($sectionMatch.Success) { $sectionFont } else { $font }
        if ($measureGraphics.MeasureString($text, $lineFont).Width -gt $printableWidth) {
            throw "Una riga della comanda supera l'area stampabile del rotolo da 80 mm."
        }
    }
}
finally {
    $measureGraphics.Dispose()
    $measureBitmap.Dispose()
}

$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings = $printerSettings
$document.DefaultPageSettings.PaperSize = $paperSize
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$document.DocumentName = "Comanda Gestionale"
$printState = [pscustomobject]@{
    Lines = $lines
    LineIndex = 0
    Font = $font
    SectionFont = $sectionFont
}

$printPage = {
    param($sender, $eventArgs)

    $graphics = $eventArgs.Graphics
    $graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
    $printableArea = $eventArgs.PageSettings.PrintableArea
    $lineHeight = $printState.Font.GetHeight($graphics)
    $y = [single]$printableArea.Y
    $bottom = $printableArea.Y + $printableArea.Height

    while ($printState.LineIndex -lt $printState.Lines.Length) {
        $line = $printState.Lines[$printState.LineIndex]
        $sectionMatch = [regex]::Match($line, '^@@SECTION:(.*)@@$')
        $isSection = $sectionMatch.Success
        $text = if ($isSection) { $sectionMatch.Groups[1].Value } else { $line }
        $lineFont = if ($isSection) { $printState.SectionFont } else { $printState.Font }
        $topSpacing = if ($isSection) { 6 } else { 0 }
        $bottomSpacing = if ($isSection) { 8 } else { 0 }
        $lineHeight = $lineFont.GetHeight($graphics)
        $requiredHeight = $topSpacing + $lineHeight + $bottomSpacing
        if ($y -gt $printableArea.Y -and $y + $requiredHeight -gt $bottom) {
            $eventArgs.HasMorePages = $true
            return
        }
        if ($graphics.MeasureString($text, $lineFont).Width -gt $printableArea.Width) {
            throw "Una riga della comanda supera l'area stampabile del rotolo da 80 mm."
        }

        $y += $topSpacing
        if ($isSection) {
            $textWidth = $graphics.MeasureString($text, $lineFont).Width
            $x = $printableArea.X + [Math]::Max(0, ($printableArea.Width - $textWidth) / 2)
            $graphics.DrawString($text, $lineFont, [System.Drawing.Brushes]::Black, [single]$x, $y)
            $y += $lineHeight
            $graphics.DrawLine(
                [System.Drawing.Pens]::Black,
                [single]$printableArea.X,
                $y,
                [single]($printableArea.X + $printableArea.Width),
                $y
            )
            $y += $bottomSpacing
        }
        else {
            $graphics.DrawString(
                $text,
                $lineFont,
                [System.Drawing.Brushes]::Black,
                [single]$printableArea.X,
                $y
            )
            $y += $lineHeight
        }

        $printState.LineIndex++
    }

    $eventArgs.HasMorePages = $false
}.GetNewClosure()

$document.add_PrintPage([System.Drawing.Printing.PrintPageEventHandler]$printPage)
try {
    if ($PSCmdlet.ShouldProcess($PrinterName, "Stampare la comanda")) {
        $document.Print()
    }
}
finally {
    $document.Dispose()
    $font.Dispose()
    $sectionFont.Dispose()
}
