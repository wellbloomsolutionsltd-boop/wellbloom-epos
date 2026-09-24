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

Write-Host `
    "Backup created: $file"
