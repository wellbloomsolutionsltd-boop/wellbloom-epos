param(
    [string]$Database = "wellbloom_pos",
    [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item `
        -ItemType Directory `
        -Path $BackupDir |
        Out-Null
}

$timestamp =
    Get-Date `
        -Format "yyyyMMdd_HHmmss"

$file =
    Join-Path `
        $BackupDir `
        "wellbloom_pos_$timestamp.dump"

pg_dump `
    -Fc `
    $Database `
    -f $file

if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $file) {
        Remove-Item -LiteralPath $file
    }

    throw "Database backup failed with exit code $LASTEXITCODE"
}

Write-Host `
    "Backup created: $file"
